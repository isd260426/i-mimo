#!/bin/bash
# install-i-mimo.sh
# Automated Deployment Script for I-MIMO Platform microservices on Ubuntu 22.04 LTS
# Target IP: 10.10.43.105

# Exit immediately if a command exits with a non-zero status
set -e

LOG_FILE="/var/log/i-mimo-deploy.log"
NAMESPACE="default"

# Helper logging functions
log_time() {
    date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
    echo "[$(log_time)] INFO $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo "[$(log_time)] SUCCESS $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(log_time)] ERROR $1" | tee -a "$LOG_FILE" >&2
}

log_warning() {
    echo "[$(log_time)] WARNING $1" | tee -a "$LOG_FILE"
}

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)."
    exit 1
fi

# Touch and set permission for log file
touch "$LOG_FILE"
chmod 644 "$LOG_FILE"

log_info "Deployment Started"

# 7. Rollback Function
rollback() {
    log_error "Deployment failed! Initiating rollback..."
    log_info "Removing Frontend..."
    kubectl delete -f /i-mimo/kubernetes/frontend/ --ignore-not-found=true || true
    log_info "Removing Backend..."
    kubectl delete -f /i-mimo/kubernetes/backend/ --ignore-not-found=true || true
    log_info "Removing MongoDB..."
    kubectl delete -f /i-mimo/kubernetes/mongodb/ --ignore-not-found=true || true
    log_info "Removing MySQL (if any)..."
    kubectl delete -f /i-mimo/kubernetes/mysql/ --ignore-not-found=true || true
    log_success "Rollback completed."
    exit 1
}

# Trap errors and call rollback
trap 'rollback' ERR

# 1. Environment Validation
validate_packages() {
    log_info "Validating environment packages..."
    PACKAGES=("docker" "kubectl" "kubeadm" "kubelet" "containerd" "git" "curl" "wget" "jq")
    MISSING_PACKAGES=()

    for pkg in "${PACKAGES[@]}"; do
        if ! command -v "$pkg" &> /dev/null; then
            MISSING_PACKAGES+=("$pkg")
        fi
    done

    if [ ${#MISSING_PACKAGES[@]} -eq 0 ]; then
        log_info "All required packages are already installed."
        return 0
    fi

    log_warning "Missing packages detected: ${MISSING_PACKAGES[*]}"
    log_info "Updating system packages..."
    apt-get update -y >> "$LOG_FILE" 2>&1

    # Install general utilities first
    for pkg in "git" "curl" "wget" "jq" "apt-transport-https" "ca-certificates" "gnupg"; do
        if ! command -v "$pkg" &> /dev/null; then
            log_info "Installing $pkg..."
            apt-get install -y "$pkg" >> "$LOG_FILE" 2>&1
        fi
    done

    # Install Docker and containerd if missing
    if ! command -v docker &> /dev/null || ! command -v containerd &> /dev/null; then
        log_info "Installing Docker Engine and containerd..."
        apt-get install -y docker.io containerd >> "$LOG_FILE" 2>&1
        systemctl enable --now docker containerd >> "$LOG_FILE" 2>&1
    fi

    # Configure containerd for Kubernetes (SystemdCgroup = true)
    if [ -f /etc/containerd/config.toml ]; then
        log_info "Configuring containerd SystemdCgroup..."
        mkdir -p /etc/containerd
        containerd config default > /etc/containerd/config.toml
        sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g' /etc/containerd/config.toml
        systemctl restart containerd >> "$LOG_FILE" 2>&1
    fi

    # Install Kubernetes components (kubelet, kubeadm, kubectl) if missing
    K8S_MISSING=false
    for pkg in "kubelet" "kubeadm" "kubectl"; do
        if ! command -v "$pkg" &> /dev/null; then
            K8S_MISSING=true
        fi
    done

    if [ "$K8S_MISSING" = true ]; then
        log_info "Adding Kubernetes apt repository..."
        mkdir -p -m 755 /etc/apt/keyrings
        curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
        echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /' > /etc/apt/sources.list.d/kubernetes.list
        
        log_info "Installing Kubernetes components..."
        apt-get update -y >> "$LOG_FILE" 2>&1
        apt-get install -y kubelet kubeadm kubectl >> "$LOG_FILE" 2>&1
        apt-mark hold kubelet kubeadm kubectl >> "$LOG_FILE" 2>&1
        systemctl enable --now kubelet >> "$LOG_FILE" 2>&1
    fi

    log_success "Environment validation and installation completed successfully."
}

validate_packages

# 2. Kubernetes Cluster Initialization
init_kubernetes_cluster() {
    log_info "Checking Kubernetes Cluster..."
    if ! kubectl cluster-info &> /dev/null; then
        log_warning "Kubernetes cluster not running. Initializing cluster..."
        
        # Load necessary br_netfilter module for k8s networking
        modprobe br_netfilter || true
        echo "net.bridge.bridge-nf-call-iptables = 1" >> /etc/sysctl.conf
        echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
        sysctl --system >> "$LOG_FILE" 2>&1

        # Initialize Master Node
        kubeadm init --pod-network-cidr=10.244.0.0/16 >> "$LOG_FILE" 2>&1

        # Set up kubeconfig for current root/sudo user
        mkdir -p "$HOME/.kube"
        cp -i /etc/kubernetes/admin.conf "$HOME/.kube/config"
        chown "$(id -u):$(id -g)" "$HOME/.kube/config"

        # Apply CNI network plugin (Flannel) to make nodes Ready
        log_info "Deploying Flannel CNI network plugin..."
        kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml >> "$LOG_FILE" 2>&1
        
        log_success "Kubernetes cluster initialized successfully."
    else
        log_info "Kubernetes cluster is already running."
    fi

    # Enable worker scheduling on control plane node (allow single-node cluster execution)
    log_info "Configuring control plane node-role taint..."
    kubectl taint nodes --all node-role.kubernetes.io/control-plane- || true
    kubectl taint nodes --all node-role.kubernetes.io/master- || true
}

init_kubernetes_cluster

# 3. Folder Deployment
setup_deployment_folder() {
    log_info "Setting up folder deployment under /i-mimo..."
    mkdir -p /i-mimo/backend
    mkdir -p /i-mimo/frontend
    mkdir -p /i-mimo/kubernetes

    # 4. Clone Source Code (or copy from local directory if present)
    log_info "Copying source code to target directory..."
    if [ -d "/root/i-mimo" ] && [ "$(pwd)" != "/i-mimo" ]; then
        cp -r /root/i-mimo/* /i-mimo/ || true
    elif [ -d "$HOME/i-mimo" ] && [ "$(pwd)" != "/i-mimo" ]; then
        cp -r "$HOME/i-mimo/"* /i-mimo/ || true
    elif [ "$(pwd)" != "/i-mimo" ]; then
        cp -r ./* /i-mimo/ || true
    fi
    log_success "Source code directories initialized under /i-mimo."
}

setup_deployment_folder

# Change working directory to /i-mimo for manifest applies
cd /i-mimo

# 5. Kubernetes Resource Deployment

# A. MySQL Deployment (Skipped per user request: mysql tidak perlu di installkan)
log_info "MySQL Deployment Skipped (MySQL is configured externally / mysql tidak perlu di installkan)."

# B. MongoDB Deployment
log_info "Deploying MongoDB..."
kubectl apply -f kubernetes/mongodb/ >> "$LOG_FILE" 2>&1

log_info "Waiting for MongoDB StatefulSet to be ready..."
kubectl rollout status statefulset/mongodb --timeout=180s >> "$LOG_FILE" 2>&1
log_success "MongoDB Deployed"

# MongoDB Database Seeding (Create and seed collections per user request)
seed_mongodb() {
    log_info "Seeding MongoDB with db_checklist_seed.json..."
    
    if [ -f "/i-mimo/db_checklist_seed.json" ]; then
        # Copy seed data file into the mongo pod
        kubectl cp /i-mimo/db_checklist_seed.json default/mongodb-0:/tmp/db_checklist_seed.json
        
        # Execute seed insertion using mongosh within the container
        kubectl exec -i mongodb-0 -- mongosh -u admin -p supersecretpassword --authenticationDatabase admin i_mimo --eval '
            const fs = require("fs");
            if (fs.existsSync("/tmp/db_checklist_seed.json")) {
                const raw = fs.readFileSync("/tmp/db_checklist_seed.json", "utf8");
                const data = EJSON.parse(raw);
                db.db_checklist.deleteMany({}); // Prevent duplicates on re-install
                db.db_checklist.insertMany(data);
                print("✓ Successfully seeded " + data.length + " database checklist documents in MongoDB.");
            } else {
                print("Error: db_checklist_seed.json not found in pod /tmp/");
                quit(1);
            }
        ' >> "$LOG_FILE" 2>&1
        log_success "MongoDB database checklist seeded."
    else
        log_warning "db_checklist_seed.json not found at /i-mimo/db_checklist_seed.json. Seeding skipped."
    fi
}

seed_mongodb

# C. Backend Deployment
log_info "Deploying Backend..."
# Set Docker image to target image (isd260426/i-mimo-backend:latest is expected)
kubectl apply -f kubernetes/backend/ >> "$LOG_FILE" 2>&1

log_info "Waiting for Backend deployment rollout..."
kubectl rollout status deployment/i-mimo-backend --timeout=180s >> "$LOG_FILE" 2>&1
log_success "Backend Deployed"

# D. Frontend Deployment
log_info "Deploying Frontend..."
kubectl apply -f kubernetes/frontend/ >> "$LOG_FILE" 2>&1

log_info "Waiting for Frontend deployment rollout..."
kubectl rollout status deployment/i-mimo-frontend --timeout=180s >> "$LOG_FILE" 2>&1
log_success "Frontend Deployed"

# 9. Auto Recovery Function
check_and_recover() {
    local max_retries=3
    local attempt=1
    while [ $attempt -le $max_retries ]; do
        log_info "Checking pod health statuses (Attempt $attempt/$max_retries)..."
        
        # Identify pods in bad statuses (CrashLoopBackOff, ImagePullBackOff, ErrImagePull, Error, Failed)
        local failed_apps=$(kubectl get pods -n "$NAMESPACE" -o json | jq -r '
            .items[] | 
            select(
                .status.containerStatuses[]?.state.waiting.reason == "CrashLoopBackOff" or 
                .status.containerStatuses[]?.state.waiting.reason == "ImagePullBackOff" or 
                .status.containerStatuses[]?.state.waiting.reason == "ErrImagePull" or 
                .status.phase == "Failed" or 
                .status.containerStatuses[]?.state.terminated.reason == "Error"
            ) | 
            .metadata.labels.app
        ' | sort -u)

        if [ -z "$failed_apps" ]; then
            log_info "All application pods are running or completed successfully."
            return 0
        fi

        log_warning "Problematic pod statuses detected for apps: $failed_apps"
        for app in $failed_apps; do
            local dep_name=""
            if [ "$app" == "i-mimo-backend" ]; then
                dep_name="i-mimo-backend"
            elif [ "$app" == "i-mimo-frontend" ]; then
                dep_name="i-mimo-frontend"
            fi

            if [ -n "$dep_name" ]; then
                log_info "Auto Recovery: Triggering rollout restart on deployment/$dep_name..."
                kubectl rollout restart deployment/"$dep_name" >> "$LOG_FILE" 2>&1
                kubectl rollout status deployment/"$dep_name" --timeout=60s >> "$LOG_FILE" 2>&1 || true
            fi
        done

        attempt=$((attempt+1))
        sleep 10
    done

    log_error "Auto Recovery could not stabilize all pods after $max_retries attempts."
    return 1
}

check_and_recover

log_success "Deployment Completed"

# 10. Final Report
echo "========================================================================"
echo "                   I-MIMO DEPLOYMENT FINAL REPORT"
echo "========================================================================"
echo ""
echo ">>> kubectl get pods -A -o wide"
kubectl get pods -A -o wide
echo ""
echo ">>> kubectl get svc -A"
kubectl get svc -A
echo ""
echo ">>> kubectl get ingress -A"
kubectl get ingress -A || echo "No Ingress controllers configured."
echo ""
echo ">>> kubectl get pvc -A"
kubectl get pvc -A
echo ""
echo "------------------------------------------------------------------------"
echo "URL Akses Layanan:"
echo "Frontend  : http://10.10.43.105:30201"
echo "Backend   : http://10.10.43.105:30200"
echo "MySQL     : mysql-service:3306 (External/Skipped Deployment)"
echo "MongoDB   : mongo-service:27017"
echo "========================================================================"
