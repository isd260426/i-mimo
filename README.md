# I-MIMO Platform - Panduan Migrasi & Instalasi Microservices

Panduan ini berisi langkah-langkah instalasi dan konfigurasi arsitektur microservices untuk aplikasi **I-MIMO Platform** (Backend Go, Frontend Nginx Static, MySQL, MongoDB, & Kubernetes).

---

## 🛠️ Prasyarat (Prerequisites)

Sebelum memulai instalasi, pastikan software berikut telah terinstal pada mesin lokal Anda:
1. **Docker Desktop** atau **Docker Engine** (v20.10+)
2. **Kubernetes Cluster** (Minikube, MicroK8s, k3s, atau Kubernetes bawaan Docker Desktop)
3. **kubectl** (Kubernetes CLI) yang sudah terhubung ke cluster aktif Anda.
4. **MongoDB Database Tools** (untuk menggunakan perintah `mongoimport`)
5. **MySQL Client** (untuk me-restore skema tabel)

---

## 📂 Langkah 1: Persiapan & Penjelasan File Manifest

Seluruh konfigurasi telah tersusun di folder `kubernetes/`:
* `mysql/`: Konfigurasi Persistent Volume (PV/PVC), Secret Password, Deployment, dan Service untuk MySQL.
* `mongodb/`: Konfigurasi PV/PVC, ConfigMap, Secret, Service, dan StatefulSet untuk MongoDB.
* `backend/`: Deployment Go API dan NodePort Service (`30080`).
* `frontend/`: Deployment Web Static Nginx dan NodePort Service (`30081`).

---

## 💾 Langkah 2: Inisialisasi & Import Database

### A. Database MySQL (Users & Menus)
Gunakan skema SQL awal dari file `d:\laragon\www\i-mimo\config\database.sql` untuk membuat tabel dan data awal menu navigasi di server MySQL Anda:

```bash
# Hubungkan ke MySQL dan buat database i_mimo
mysql -h <mysql_host> -u root -p -e "CREATE DATABASE IF NOT EXISTS i_mimo;"

# Import tabel 'users' dan 'menus' beserta menu-menu default
mysql -h <mysql_host> -u root -p i_mimo < d:\laragon\www\i-mimo\config\database.sql

# Seed default administrator account 'admin' (password: admin123)
mysql -h <mysql_host> -u root -p i_mimo -e "INSERT INTO users (username, password, name, created_by) VALUES ('admin', '\$2y\$10\$JbSox26y8w/pEXs0dM4/F.4iU9P3Y6pP2u70B.H/h/e2D.j2j92je', 'Administrator ISD', 'System') ON DUPLICATE KEY UPDATE name=VALUES(name);"
```

### B. Database MongoDB (Checklist Daily Logs)
Impor data riwayat checklist harian dari file `db_checklist_seed.json` yang telah disediakan ke dalam koleksi MongoDB:

```bash
# Impor ke database lokal / target MongoDB
mongoimport --db i_mimo --collection db_checklist --file d:\laragon\www\i-mimo-microservices\db_checklist_seed.json --jsonArray
```

---

## 🐳 Langkah 3: Menjalankan Lokal Menggunakan Docker Compose (Opsi Cepat)

Jika Anda ingin menjalankan aplikasi secara langsung di Docker lokal (multi-container) sebelum mendeploy ke Kubernetes:

1. Buka terminal pada root direktori proyek (`d:\laragon\www\i-mimo-microservices`).
2. Jalankan perintah berikut:
   ```bash
   docker-compose up -d --build
   ```
3. Docker Compose akan menginisialisasi MySQL, MongoDB, Backend (Go), dan Frontend (Nginx).
4. Akses aplikasi:
   * **Frontend UI**: `http://localhost:30081`
   * **Backend API**: `http://localhost:30080`

---

## ☸️ Langkah 4: Deployment ke Kubernetes (Step-by-Step)

Jalankan perintah ini secara berurutan untuk mendeploy seluruh stack aplikasi ke Kubernetes cluster.

### 1. Buat Namespace (Opsional)
Anda bisa mendeploy di namespace `default` atau membuat namespace khusus untuk I-MIMO:
```bash
kubectl create namespace i-mimo
kubectl config set-context --current --namespace=i-mimo
```

### 2. Deploy Layer Database MySQL
Terapkan konfigurasi penyimpanan, secret password, deployment, dan service MySQL:
```bash
# Terapkan PV dan PVC untuk MySQL
kubectl apply -f kubernetes/mysql/mysql-pv-pvc.yml

# Terapkan Secret kredensial password database
kubectl apply -f kubernetes/mysql/mysql-secret.yml

# Jalankan Deployment MySQL
kubectl apply -f kubernetes/mysql/mysql-deployment.yml

# Daftarkan Service internal MySQL
kubectl apply -f kubernetes/mysql/mysql-service.yml
```

### 3. Deploy Layer Database MongoDB
Terapkan PV/PVC, ConfigMap konfigurasi mongod, Secret kredensial database, StatefulSet, dan Headless service:
```bash
# Terapkan PV dan PVC MongoDB
kubectl apply -f kubernetes/mongodb/mongo-pc-pcv.yml

# Terapkan ConfigMap mongo.conf
kubectl apply -f kubernetes/mongodb/mongo-configmap.yml

# Terapkan Secret MongoDB root
kubectl apply -f kubernetes/mongodb/mongo-secret.yml

# Terapkan Headless Service untuk StatefulSet
kubectl apply -f kubernetes/mongodb/mongo-service.yml

# Jalankan StatefulSet MongoDB
kubectl apply -f kubernetes/mongodb/mongo-statefulset.yml
```

### 4. Deploy Backend Go API
Build image docker backend Anda (tag: `isd260426/i-mimo-backend:latest`) lalu daftarkan ke K8s cluster:
```bash
# Jalankan pod backend Go API
kubectl apply -f kubernetes/backend/backend-deployment.yml

# Jalankan Service NodePort backend (diakses di port 30080)
kubectl apply -f kubernetes/backend/backend-service.yml
```

### 5. Deploy Frontend Static Web (Nginx)
Build image docker frontend Anda (tag: `isd260426/i-mimo-frontend:latest`) lalu daftarkan ke K8s cluster:
```bash
# Jalankan pod Nginx frontend
kubectl apply -f kubernetes/frontend/frontend-deployment.yml

# Jalankan Service NodePort frontend (diakses di port 30081)
kubectl apply -f kubernetes/frontend/frontend-service.yml
```

### 6. Verifikasi Pods & Services
Pastikan semua pod telah berjalan dengan status `Running`:
```bash
kubectl get pods
kubectl get services
```

---

## 🔑 Akun & Akses Pengujian

* **Akses Dashboard**: Buka browser Anda dan navigasikan ke `http://<IP_NODE_K8S>:30081` (atau `http://localhost:30081` jika menggunakan Minikube / Docker Desktop local).
* **Akun Administrator Default**:
  - **Username**: `admin`
  - **Password**: `admin123`
