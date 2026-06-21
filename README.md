# I-MIMO Platform - Panduan Migrasi & Instalasi Otomatis Microservices

Panduan ini berisi instruksi lengkap untuk mendeploy arsitektur microservices aplikasi **I-MIMO Platform** secara otomatis menggunakan script deployment Bash pada server **Linux Ubuntu 22.04 LTS** dengan IP **IP_SERVER**.

Arsitektur microservices ini terdiri dari:
- **Frontend**: Nginx Web Server serving Static HTML/CSS/JS (Exposed via NodePort `30201`).
- **Backend**: Golang REST API Server (Exposed via NodePort `30200`).
- **MongoDB**: StatefulSet database menyimpan log checklist daily (Internal port `27017`).
- **MySQL**: Database relational menyimpan data users & menus (Dikonfigurasi eksternal/di luar cluster K8s).

---

## 🛠️ Prasyarat (Prerequisites)

Script instalasi otomatis (`install-i-mimo.sh`) akan memvalidasi dan menginstal package berikut secara otomatis jika belum tersedia pada server:
1. **Docker Engine** / **containerd**
2. **kubeadm**, **kubelet**, dan **kubectl** (v1.28+)
3. **git**, **curl**, **wget**, dan **jq**

---

## 📂 Struktur Direktori Proyek

Folder deployment menggunakan struktur berikut:
```text
/i-mimo/
├── backend/
│   ├── Dockerfile
│   ├── go.mod
│   └── main.go
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── static/
│       ├── css/
│       ├── images/
│       └── js/
├── kubernetes/
│   ├── mongodb/
│   │   ├── mongo-configmap.yml
│   │   ├── mongo-pc-pcv.yml
│   │   ├── mongo-secret.yml
│   │   ├── mongo-service.yml
│   │   └── mongo-statefulset.yml
│   ├── backend/
│   │   ├── backend-deployment.yml
│   │   └── backend-service.yml
│   └── frontend/
│       ├── frontend-deployment.yml
│       └── frontend-service.yml
├── install-i-mimo.sh
├── uninstall-i-mimo.sh
├── healthcheck-i-mimo.sh
├── rollback-i-mimo.sh
└── db_checklist_seed.json
```

---

## ⚙️ Resolusi Port & Konflik

Untuk menghindari tabrakan port dengan aplikasi lain (seperti `micro_service` pada port 30080/30081 dan Prometheus/Grafana pada port 30090/30091), port NodePort I-MIMO dialokasikan ulang:
- **Backend NodePort**: `30200`
- **Frontend NodePort**: `30201`

Aplikasi Frontend juga dikonfigurasi dengan Nginx Reverse Proxy internal untuk meneruskan request API `/api/v1/` secara transparan ke `http://i-mimo-backend-service:8080/api/v1/`.

---

## 🚀 Panduan Penggunaan Script Deployment

Seluruh script harus dijalankan sebagai user **root** (`sudo`).

### 1. Script Instalasi Otomatis (`install-i-mimo.sh`)
Script ini melakukan inisialisasi lingkungan lengkap:
- Melakukan validasi paket dan instalasi otomatis.
- Menginisialisasi cluster Kubernetes (`kubeadm init` jika belum ada).
- Menghapus taint control-plane agar master node dapat menjalankan pods.
- Membuat folder `/i-mimo` dan menyalin file source code.
- Mendeploy MongoDB StatefulSet dan menunggunya sampai Ready.
- **Melakukan Seeding Database MongoDB otomatis** dari file `db_checklist_seed.json` menggunakan `mongosh` dan EJSON parsing.
- Mendeploy Go Backend API dan Nginx Frontend.
- Menjalankan **Auto Recovery** jika terdeteksi pod berstatus `CrashLoopBackOff`, `ImagePullBackOff`, atau `Error` (maksimal 3 kali retry dengan restart rollout).
- Mencatat seluruh aktivitas deployment ke `/var/log/i-mimo-deploy.log`.

**Cara Menjalankan:**
```bash
chmod +x install-i-mimo.sh
sudo ./install-i-mimo.sh
```

---

### 2. Script Pemeriksaan Kesehatan (`healthcheck-i-mimo.sh`)
Script ini mendiagnosis dan memvalidasi status seluruh komponen yang berjalan di cluster. Format output diagnostics ringkas:
```text
✓ Kubernetes Ready
✓ MySQL Ready
✓ MongoDB Ready
✓ Backend Ready
✓ Frontend Ready
```
*Catatan: Validasi MySQL dilakukan secara real-time dengan menanyakan status konektivitas database ke endpoint `/api/v1/health` milik Backend.*

**Cara Menjalankan:**
```bash
chmod +x healthcheck-i-mimo.sh
sudo ./healthcheck-i-mimo.sh
```

---

### 3. Script Rollback Otomatis & Manual (`rollback-i-mimo.sh`)
Script rollback dipanggil secara otomatis oleh `install-i-mimo.sh` jika proses deployment mengalami kegagalan sistem. Script ini juga dapat dijalankan secara manual untuk membersihkan seluruh resource Kubernetes yang telah dibuat.

**Cara Menjalankan:**
```bash
chmod +x rollback-i-mimo.sh
sudo ./rollback-i-mimo.sh
```

---

### 4. Script Uninstalasi Proyek (`uninstall-i-mimo.sh`)
Digunakan untuk menghapus seluruh komponen aplikasi I-MIMO dari cluster Kubernetes secara permanen dan mencatat prosesnya ke file log.

**Cara Menjalankan:**
```bash
chmod +x uninstall-i-mimo.sh
sudo ./uninstall-i-mimo.sh
```

---

## 📝 Format Logging Aktivitas (`/var/log/i-mimo-deploy.log`)

Setiap tindakan deployment dicatat dengan stempel waktu dalam format berikut:
```text
[2026-06-21 14:30:00] INFO Deployment Started
[2026-06-21 14:30:05] INFO MySQL Deployment Skipped (MySQL is configured externally)
[2026-06-21 14:30:15] INFO MongoDB Deployed
[2026-06-21 14:30:20] INFO Backend Deployed
[2026-06-21 14:30:25] INFO Frontend Deployed
[2026-06-21 14:30:35] SUCCESS Deployment Completed
```

---

## 🔗 URL Akses Layanan

Setelah proses deployment berhasil, berikut adalah informasi akses ke layanan:

| Layanan | Protokol / Domain | Keterangan |
| :--- | :--- | :--- |
| **Frontend Web** | [http://IP_SERVER:30201](http://IP_SERVER:30201) | Dashboard Interface utama aplikasi |
| **Backend API** | [http://IP_SERVER:30200](http://IP_SERVER:30200) | REST API Endpoint (Exposed) |
| **MongoDB** | `mongo-service:27017` | Koneksi internal cluster (tanpa NodePort) |
| **MySQL DB** | `mysql-service:3306` | Akses basis data relational (Eksternal) |

* Default Admin Login Account:
  - **Username**: `admin`
  - **Password**: `admin123`
