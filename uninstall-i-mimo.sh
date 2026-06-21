#!/bin/bash
# uninstall-i-mimo.sh
# Automated Teardown Script for I-MIMO Platform microservices

# Exit immediately if a command exits with a non-zero status
set -e

LOG_FILE="/var/log/i-mimo-deploy.log"

log_time() {
    date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
    echo "[$(log_time)] INFO Uninstall: $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo "[$(log_time)] SUCCESS Uninstall: $1" | tee -a "$LOG_FILE"
}

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)."
    exit 1
fi

log_info "Uninstall Started"

# 1. Delete Frontend resources
log_info "Deleting Frontend resources..."
if [ -d "/i-mimo/kubernetes/frontend" ]; then
    kubectl delete -f /i-mimo/kubernetes/frontend/ --ignore-not-found=true || true
elif [ -d "kubernetes/frontend" ]; then
    kubectl delete -f kubernetes/frontend/ --ignore-not-found=true || true
fi

# 2. Delete Backend resources
log_info "Deleting Backend resources..."
if [ -d "/i-mimo/kubernetes/backend" ]; then
    kubectl delete -f /i-mimo/kubernetes/backend/ --ignore-not-found=true || true
elif [ -d "kubernetes/backend" ]; then
    kubectl delete -f kubernetes/backend/ --ignore-not-found=true || true
fi

# 3. Delete MongoDB resources
log_info "Deleting MongoDB resources..."
if [ -d "/i-mimo/kubernetes/mongodb" ]; then
    kubectl delete -f /i-mimo/kubernetes/mongodb/ --ignore-not-found=true || true
elif [ -d "kubernetes/mongodb" ]; then
    kubectl delete -f kubernetes/mongodb/ --ignore-not-found=true || true
fi

log_success "Uninstall Completed successfully."
echo "========================================================================"
echo "I-MIMO Platform has been uninstalled from Kubernetes."
echo "Logs preserved in: $LOG_FILE"
echo "========================================================================"
