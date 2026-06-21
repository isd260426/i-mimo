#!/bin/bash
# rollback-i-mimo.sh
# Rollback script to clean up Kubernetes manifests for I-MIMO Platform

# Exit immediately if a command exits with a non-zero status
set -e

LOG_FILE="/var/log/i-mimo-deploy.log"

log_time() {
    date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
    echo "[$(log_time)] INFO Rollback: $1" | tee -a "$LOG_FILE"
}

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo)."
    exit 1
fi

log_info "Rollback triggered manually."

# Execute cleanup
if [ -d "/i-mimo/kubernetes/frontend" ]; then
    kubectl delete -f /i-mimo/kubernetes/frontend/ --ignore-not-found=true || true
elif [ -d "kubernetes/frontend" ]; then
    kubectl delete -f kubernetes/frontend/ --ignore-not-found=true || true
fi

if [ -d "/i-mimo/kubernetes/backend" ]; then
    kubectl delete -f /i-mimo/kubernetes/backend/ --ignore-not-found=true || true
elif [ -d "kubernetes/backend" ]; then
    kubectl delete -f kubernetes/backend/ --ignore-not-found=true || true
fi

if [ -d "/i-mimo/kubernetes/mongodb" ]; then
    kubectl delete -f /i-mimo/kubernetes/mongodb/ --ignore-not-found=true || true
elif [ -d "kubernetes/mongodb" ]; then
    kubectl delete -f kubernetes/mongodb/ --ignore-not-found=true || true
fi

# Clean up MySQL (optional but included for completeness in case it was applied manually)
if [ -d "/i-mimo/kubernetes/mysql" ]; then
    kubectl delete -f /i-mimo/kubernetes/mysql/ --ignore-not-found=true || true
elif [ -d "kubernetes/mysql" ]; then
    kubectl delete -f kubernetes/mysql/ --ignore-not-found=true || true
fi

log_info "Rollback completed."
echo "========================================================================"
echo "Rollback executed: All I-MIMO resources deleted from Kubernetes."
echo "========================================================================"
