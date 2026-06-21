#!/bin/bash
# healthcheck-i-mimo.sh
# Diagnostic and Health Validation script for I-MIMO Platform

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0;m' # No Color

echo "========================================================================"
echo "                   I-MIMO DIAGNOSTICS RUN"
echo "========================================================================"
echo ""
echo ">>> Nodes Status:"
kubectl get nodes
echo ""
echo ">>> Pods Status:"
kubectl get pods -A
echo ""
echo ">>> Services Status:"
kubectl get svc -A
echo ""
echo ">>> PVCs Status:"
kubectl get pvc -A
echo ""
echo "========================================================================"
echo "                   HEALTHCHECK VERIFICATION"
echo "========================================================================"

# Helper checks
KUBE_READY=false
MYSQL_READY=false
MONGO_READY=false
BACKEND_READY=false
FRONTEND_READY=false

# 1. Kubernetes Cluster Ready Check
if kubectl cluster-info &> /dev/null; then
    # Check if all nodes are in Ready state
    NOT_READY_NODES=$(kubectl get nodes --no-headers | grep -v -w "Ready" || true)
    if [ -z "$NOT_READY_NODES" ]; then
        KUBE_READY=true
    fi
fi

# 2. MongoDB Ready Check (StatefulSet ready replicas check)
MONGO_REPLICAS=$(kubectl get statefulset mongodb -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
MONGO_READY_REPLICAS=$(kubectl get statefulset mongodb -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$MONGO_REPLICAS" -gt 0 ] && [ "$MONGO_REPLICAS" -eq "$MONGO_READY_REPLICAS" ]; then
    MONGO_READY=true
fi

# 3. Backend Ready Check
BACKEND_REPLICAS=$(kubectl get deployment i-mimo-backend -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
BACKEND_READY_REPLICAS=$(kubectl get deployment i-mimo-backend -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$BACKEND_REPLICAS" -gt 0 ] && [ "$BACKEND_REPLICAS" -eq "$BACKEND_READY_REPLICAS" ]; then
    # Verify API response
    if curl -s -m 3 http://IP_SERVER:30200/api/v1/health &> /dev/null; then
        BACKEND_READY=true
    fi
fi

# 4. MySQL Ready Check (via Backend API connection status)
# Since MySQL deployment is skipped, we verify connection readiness from the Backend API's health check endpoint
if [ "$BACKEND_READY" = true ]; then
    HEALTH_RESP=$(curl -s -m 3 http://IP_SERVER:30200/api/v1/health || echo "{}")
    MYSQL_STATUS=$(echo "$HEALTH_RESP" | jq -r '.services.mysql' 2>/dev/null || echo "DOWN")
    if [ "$MYSQL_STATUS" = "OK" ]; then
        MYSQL_READY=true
    fi
    # Double-check MongoDB connection from Backend perspective as well
    MONGO_STATUS=$(echo "$HEALTH_RESP" | jq -r '.services.mongodb' 2>/dev/null || echo "DOWN")
    if [ "$MONGO_STATUS" != "OK" ]; then
        MONGO_READY=false
    fi
fi

# 5. Frontend Ready Check
FRONTEND_REPLICAS=$(kubectl get deployment i-mimo-frontend -o jsonpath='{.status.replicas}' 2>/dev/null || echo "0")
FRONTEND_READY_REPLICAS=$(kubectl get deployment i-mimo-frontend -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
if [ "$FRONTEND_REPLICAS" -gt 0 ] && [ "$FRONTEND_REPLICAS" -eq "$FRONTEND_READY_REPLICAS" ]; then
    # Verify HTTP response code (should be 200 or 304 or redirect)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 3 http://IP_SERVER:30201/ || echo "000")
    if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 304 ]; then
        FRONTEND_READY=true
    fi
fi

# Output results in requested format
if [ "$KUBE_READY" = true ]; then
    echo -e "${GREEN}✓ Kubernetes Ready${NC}"
else
    echo -e "${RED}✗ Kubernetes Down${NC}"
fi

if [ "$MYSQL_READY" = true ]; then
    echo -e "${GREEN}✓ MySQL Ready${NC}"
else
    echo -e "${RED}✗ MySQL Down (Failed connection from Backend)${NC}"
fi

if [ "$MONGO_READY" = true ]; then
    echo -e "${GREEN}✓ MongoDB Ready${NC}"
else
    echo -e "${RED}✗ MongoDB Down${NC}"
fi

if [ "$BACKEND_READY" = true ]; then
    echo -e "${GREEN}✓ Backend Ready${NC}"
else
    echo -e "${RED}✗ Backend Down${NC}"
fi

if [ "$FRONTEND_READY" = true ]; then
    echo -e "${GREEN}✓ Frontend Ready${NC}"
else
    echo -e "${RED}✗ Frontend Down${NC}"
fi
echo "========================================================================"
