path/to/i-mimo/
├── backend/
│   ├── Dockerfile
│   ├── go.mod
│   └── main.go                  <-- CRUD Users/Menus, Checklists, & Export Controller
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── static/
│       ├── css/
│       │   ├── login.css
│       │   └── dashboard.css
│       ├── images/
│       │   ├── isd_logo.png
│       │   └── isd_logo_icon.png
│       ├── js/
│       │   ├── LoginController.js
│       │   ├── login.js
│       │   ├── dashboard.js
│       │   ├── database_check.js
│       │   ├── master_user.js   <-- CRUD Administrator fetch/save/delete (JWT)
│       │   └── menu_master.js   <-- CRUD Menu settings fetch/save/delete (JWT)
│       ├── index.html
│       └── dashboard.html
└── kubernetes/                  <-- Kubernetes Manifests
    ├── mysql/
    │   ├── mysql-pv-pvc.yml
    │   ├── mysql-secret.yml
    │   ├── mysql-deployment.yml
    │   └── mysql-service.yml
    ├── mongodb/
    │   ├── mongo-pc-pcv.yml
    │   ├── mongo-secret.yml
    │   ├── mongo-configmap.yml
    │   ├── mongo-service.yml
    │   └── mongo-statefulset.yml
    ├── backend/
    │   ├── backend-deployment.yml
    │   └── backend-service.yml
    └── frontend/
        ├── frontend-deployment.yml
        └── frontend-service.yml
