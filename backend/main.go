package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/go-sql-driver/mysql"
	"github.com/golang-jwt/jwt/v4"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

var (
	mysqlDB     *sql.DB
	mongoClient *mongo.Client
	mongoDB     *mongo.Database
	jwtSecret   = []byte("i_mimo_super_secret_jwt_key")
)

type User struct {
	ID        int       `json:"id"`
	Username  string    `json:"username"`
	Password  string    `json:"password,omitempty"`
	Name      string    `json:"name"`
	CreatedBy string    `json:"created_by"`
	UpdatedBy string    `json:"updated_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Menu struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	URL       string `json:"url"`
	Icon      string `json:"icon"`
	OrderNo   int    `json:"order_no"`
	IsActive  int    `json:"is_active"`
	CreatedBy string `json:"created_by"`
	UpdatedBy string `json:"updated_by"`
}

type Checklist struct {
	ID                string    `json:"id,omitempty" bson:"_id,omitempty"`
	CheckDate         string    `json:"check_date" bson:"check_date"`
	ServerType        string    `json:"server_type" bson:"server_type"`
	Session           string    `json:"session" bson:"session"`
	CPURAMStatus      string    `json:"cpu_ram_status" bson:"cpu_ram_status"`
	DiskStatus        string    `json:"disk_status" bson:"disk_status"`
	ReplicationStatus string    `json:"replication_status" bson:"replication_status"`
	BackupStatus      string    `json:"backup_status" bson:"backup_status"`
	Notes             string    `json:"notes" bson:"notes"`
	CreatedBy         string    `json:"created_by" bson:"created_by"`
	UpdatedBy         string    `json:"updated_by" bson:"updated_by"`
	CreatedAt         time.Time `json:"created_at" bson:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" bson:"updated_at"`
}

type Claims struct {
	UserID   int    `json:"user_id"`
	Username string `json:"username"`
	Name     string `json:"name"`
	jwt.RegisteredClaims
}

func main() {
	// Initialize Databases
	initMySQL()
	initMongoDB()

	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// Public Routes
	v1 := r.Group("/api/v1")
	{
		v1.POST("/auth/login", loginHandler)
		v1.GET("/health", healthHandler)
	}

	// Protected Routes (requires JWT)
	protected := r.Group("/api/v1")
	protected.Use(authMiddleware())
	{
		protected.GET("/menus", getMenusHandler)
		protected.POST("/menus", createMenuHandler)
		protected.PUT("/menus", updateMenuHandler)
		protected.DELETE("/menus/:id", deleteMenuHandler)

		protected.GET("/users", getUsersHandler)
		protected.POST("/users", createUserHandler)
		protected.PUT("/users", updateUserHandler)
		protected.DELETE("/users/:id", deleteUserHandler)

		protected.GET("/checklists", getChecklistsHandler)
		protected.POST("/checklists", saveChecklistHandler)

		protected.GET("/export", exportHandler)
	}

	port := os.Getenv("APP_PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("I-MIMO Backend listening on port %s...", port)
	r.Run(":" + port)
}

func initMySQL() {
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "3306"
	}
	user := os.Getenv("DB_USER")
	if user == "" {
		user = "root"
	}
	pass := os.Getenv("DB_PASS")
	name := os.Getenv("DB_NAME")
	if name == "" {
		name = "i_mimo"
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true", user, pass, host, port, name)
	var err error
	mysqlDB, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Failed to open MySQL connection: %v", err)
	}

	mysqlDB.SetMaxOpenConns(10)
	mysqlDB.SetMaxIdleConns(5)
	mysqlDB.SetConnMaxLifetime(time.Minute * 5)

	// Ping database
	err = mysqlDB.Ping()
	if err != nil {
		log.Printf("Warning: MySQL server ping failed: %v", err)
	} else {
		log.Println("Successfully connected to MySQL database.")
	}
}

func initMongoDB() {
	host := os.Getenv("MONGO_HOST")
	if host == "" {
		host = "localhost"
	}
	port := os.Getenv("MONGO_PORT")
	if port == "" {
		port = "27017"
	}
	user := os.Getenv("MONGO_USER")
	pass := os.Getenv("MONGO_PASS")
	dbName := os.Getenv("MONGO_DB")
	if dbName == "" {
		dbName = "i_mimo"
	}

	var uri string
	if user != "" && pass != "" {
		uri = fmt.Sprintf("mongodb://%s:%s@%s:%s", user, pass, host, port)
	} else {
		uri = fmt.Sprintf("mongodb://%s:%s", host, port)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	mongoClient, err = mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}

	mongoDB = mongoClient.Database(dbName)
	log.Println("Successfully connected to MongoDB database.")
}

func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		tokenString := ""
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}
		if tokenString == "" {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Authorization token missing"})
			c.Abort()
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Invalid or expired token"})
			c.Abort()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("name", claims.Name)
		c.Next()
	}
}

func loginHandler(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Username and password required"})
		return
	}

	var user User
	err := mysqlDB.QueryRow("SELECT id, username, password, name FROM users WHERE username = ?", input.Username).Scan(
		&user.ID, &user.Username, &user.Password, &user.Name,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Username or password incorrect"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Database query error"})
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Username or password incorrect"})
		return
	}

	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID:   user.ID,
		Username: user.Username,
		Name:     user.Name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Login successful",
		"token":   tokenString,
		"user": gin.H{
			"username": user.Username,
			"name":     user.Name,
		},
	})
}

func getMenusHandler(c *gin.Context) {
	allParam := c.Query("all")
	var query string
	if allParam == "true" {
		query = "SELECT id, name, slug, url, icon, order_no, is_active, COALESCE(created_by, ''), COALESCE(updated_by, '') FROM menus ORDER BY order_no ASC, id ASC"
	} else {
		query = "SELECT id, name, slug, url, icon, order_no, is_active, COALESCE(created_by, ''), COALESCE(updated_by, '') FROM menus WHERE is_active = 1 ORDER BY order_no ASC"
	}

	rows, err := mysqlDB.Query(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	defer rows.Close()

	var menus []Menu
	for rows.Next() {
		var m Menu
		if err := rows.Scan(&m.ID, &m.Name, &m.Slug, &m.URL, &m.Icon, &m.OrderNo, &m.IsActive, &m.CreatedBy, &m.UpdatedBy); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
			return
		}
		menus = append(menus, m)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": menus})
}

func createMenuHandler(c *gin.Context) {
	var input struct {
		Name     string `json:"name" binding:"required"`
		URL      string `json:"url"`
		Icon     string `json:"icon"`
		OrderNo  int    `json:"order_no"`
		IsActive int    `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	operatorName := c.MustGet("name").(string)
	name := strings.TrimSpace(input.Name)
	slug := slugify(name)
	url := strings.TrimSpace(input.URL)
	if url == "" {
		url = "#" + slug
	}
	icon := strings.TrimSpace(input.Icon)
	if icon == "" {
		icon = "bi-link"
	}

	_, err := mysqlDB.Exec("INSERT INTO menus (name, slug, url, icon, order_no, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		name, slug, url, icon, input.OrderNo, input.IsActive, operatorName, time.Now(), time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Menu berhasil ditambahkan!"})
}

func updateMenuHandler(c *gin.Context) {
	var input struct {
		ID       int    `json:"id" binding:"required"`
		Name     string `json:"name" binding:"required"`
		URL      string `json:"url"`
		Icon     string `json:"icon"`
		OrderNo  int    `json:"order_no"`
		IsActive int    `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	operatorName := c.MustGet("name").(string)
	name := strings.TrimSpace(input.Name)
	slug := slugify(name)
	url := strings.TrimSpace(input.URL)
	if url == "" {
		url = "#" + slug
	}
	icon := strings.TrimSpace(input.Icon)

	_, err := mysqlDB.Exec("UPDATE menus SET name = ?, slug = ?, url = ?, icon = ?, order_no = ?, is_active = ?, updated_by = ?, updated_at = ? WHERE id = ?",
		name, slug, url, icon, input.OrderNo, input.IsActive, operatorName, time.Now(), input.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Menu berhasil diperbarui!"})
}

func deleteMenuHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "ID menu tidak valid"})
		return
	}
	var id int
	_, err := fmt.Sscanf(idStr, "%d", &id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "ID menu tidak valid"})
		return
	}

	_, err = mysqlDB.Exec("DELETE FROM menus WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Menu berhasil dihapus!"})
}

func getUsersHandler(c *gin.Context) {
	rows, err := mysqlDB.Query("SELECT id, username, name, COALESCE(created_by, ''), COALESCE(updated_by, ''), created_at, updated_at FROM users ORDER BY id ASC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Username, &u.Name, &u.CreatedBy, &u.UpdatedBy, &u.CreatedAt, &u.UpdatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
			return
		}
		users = append(users, u)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": users})
}

func createUserHandler(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Name     string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	operatorName := c.MustGet("name").(string)
	username := strings.ToLower(strings.TrimSpace(input.Username))
	name := strings.TrimSpace(input.Name)

	var count int
	err := mysqlDB.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", username).Scan(&count)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Username sudah terpakai oleh pengguna lain"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to hash password"})
		return
	}

	_, err = mysqlDB.Exec("INSERT INTO users (username, password, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		username, string(hashedPassword), name, operatorName, time.Now(), time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "User baru berhasil ditambahkan!"})
}

func updateUserHandler(c *gin.Context) {
	var input struct {
		ID       int    `json:"id" binding:"required"`
		Username string `json:"username" binding:"required"`
		Password string `json:"password"`
		Name     string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	operatorName := c.MustGet("name").(string)
	username := strings.ToLower(strings.TrimSpace(input.Username))
	name := strings.TrimSpace(input.Name)

	var count int
	err := mysqlDB.QueryRow("SELECT COUNT(*) FROM users WHERE username = ? AND id != ?", username, input.ID).Scan(&count)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Username sudah terpakai oleh pengguna lain"})
		return
	}

	if input.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to hash password"})
			return
		}
		_, err = mysqlDB.Exec("UPDATE users SET username = ?, password = ?, name = ?, updated_by = ?, updated_at = ? WHERE id = ?",
			username, string(hashedPassword), name, operatorName, time.Now(), input.ID)
	} else {
		_, err = mysqlDB.Exec("UPDATE users SET username = ?, name = ?, updated_by = ?, updated_at = ? WHERE id = ?",
			username, name, operatorName, time.Now(), input.ID)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Profil user berhasil diperbarui!"})
}

func deleteUserHandler(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "ID user tidak valid"})
		return
	}
	var id int
	_, err := fmt.Sscanf(idStr, "%d", &id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "ID user tidak valid"})
		return
	}

	loggedInUserID := c.MustGet("user_id").(int)
	if id == loggedInUserID {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Anda tidak diperbolehkan menghapus akun Anda sendiri saat sedang aktif"})
		return
	}

	var usernameToDelete string
	err = mysqlDB.QueryRow("SELECT username FROM users WHERE id = ?", id).Scan(&usernameToDelete)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "User tidak ditemukan"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	if usernameToDelete == "admin" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Akun primary administrator (\"admin\") tidak boleh dihapus"})
		return
	}

	_, err = mysqlDB.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "User berhasil dihapus!"})
}

func getChecklistsHandler(c *gin.Context) {
	month := c.DefaultQuery("month", "")
	year := c.DefaultQuery("year", "")

	if month == "" || year == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "month and year parameters required"})
		return
	}

	collection := mongoDB.Collection("db_checklist")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Parse parameters to match YYYY-MM
	var mVal, yVal int
	fmt.Sscanf(month, "%d", &mVal)
	fmt.Sscanf(year, "%d", &yVal)

	prefix := fmt.Sprintf("^%04d-%02d", yVal, mVal)
	filter := bson.M{"check_date": bson.M{"$regex": prefix}}

	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var checklists []Checklist
	if err = cursor.All(ctx, &checklists); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": checklists})
}

func saveChecklistHandler(c *gin.Context) {
	var input Checklist
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	operatorName := c.MustGet("name").(string)

	collection := mongoDB.Collection("db_checklist")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{
		"check_date":  input.CheckDate,
		"server_type": input.ServerType,
		"session":     input.Session,
	}

	var existing Checklist
	err := collection.FindOne(ctx, filter).Decode(&existing)

	if err == mongo.ErrNoDocuments {
		input.CreatedBy = operatorName
		input.CreatedAt = time.Now()
		input.UpdatedAt = time.Now()
		_, err = collection.InsertOne(ctx, input)
	} else if err == nil {
		update := bson.M{
			"$set": bson.M{
				"cpu_ram_status":     input.CPURAMStatus,
				"disk_status":        input.DiskStatus,
				"replication_status": input.ReplicationStatus,
				"backup_status":      input.BackupStatus,
				"notes":              input.Notes,
				"updated_by":         operatorName,
				"updated_at":         time.Now(),
			},
		}
		_, err = collection.UpdateOne(ctx, filter, update)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Checklist saved successfully"})
}

func healthHandler(c *gin.Context) {
	mysqlStatus := "OK"
	if err := mysqlDB.Ping(); err != nil {
		mysqlStatus = "DOWN: " + err.Error()
	}

	mongoStatus := "OK"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := mongoClient.Ping(ctx, nil); err != nil {
		mongoStatus = "DOWN: " + err.Error()
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "UP",
		"services": gin.H{
			"mysql":   mysqlStatus,
			"mongodb": mongoStatus,
		},
	})
}

func exportHandler(c *gin.Context) {
	format := c.DefaultQuery("format", "excel")
	monthStr := c.DefaultQuery("month", "")
	yearStr := c.DefaultQuery("year", "")

	if monthStr == "" || yearStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "month and year parameters required"})
		return
	}

	var monthVal, yearVal int
	fmt.Sscanf(monthStr, "%d", &monthVal)
	fmt.Sscanf(yearStr, "%d", &yearVal)

	monthsLabel := map[int]string{
		1: "Januari", 2: "Februari", 3: "Maret", 4: "April", 5: "Mei", 6: "Juni",
		7: "Juli", 8: "Agustus", 9: "September", 10: "Oktober", 11: "November", 12: "Desember",
	}
	monthName := monthsLabel[monthVal]

	collection := mongoDB.Collection("db_checklist")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	prefix := fmt.Sprintf("^%04d-%02d", yearVal, monthVal)
	filter := bson.M{"check_date": bson.M{"$regex": prefix}}

	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var checklists []Checklist
	if err = cursor.All(ctx, &checklists); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": err.Error()})
		return
	}

	dataMap := make(map[string]map[string]map[int]Checklist)
	dataMap["master"] = map[string]map[int]Checklist{"pagi": make(map[int]Checklist), "sore": make(map[int]Checklist)}
	dataMap["slave"] = map[string]map[int]Checklist{"pagi": make(map[int]Checklist), "sore": make(map[int]Checklist)}

	for _, ch := range checklists {
		t := ch.ServerType
		s := ch.Session
		tParsed, err := time.Parse("2006-01-02", ch.CheckDate)
		if err == nil {
			d := tParsed.Day()
			if _, ok := dataMap[t]; ok {
				if _, ok2 := dataMap[t][s]; ok2 {
					dataMap[t][s][d] = ch
				}
			}
		}
	}

	type ParamConfig struct {
		Label  string
		Key    string
		PagiNo int
		SoreNo int
	}

	paramsConfig := []ParamConfig{
		{Label: "Kondisi CPU & RAM Server Database", Key: "CPURAMStatus", PagiNo: 1, SoreNo: 2},
		{Label: "Status Space Disk Server Database", Key: "DiskStatus", PagiNo: 3, SoreNo: 4},
		{Label: "Status Replication Database Master Slave", Key: "ReplicationStatus", PagiNo: 5, SoreNo: 6},
		{Label: "Backup Database Daily", Key: "BackupStatus", PagiNo: 7, SoreNo: 8},
	}

	getStatusStyles := func(val string) (string, string, string) {
		if val == "" || val == "-" {
			return "#f8f9fa", "#6c757d", "-"
		}
		if val == "Normal" || val == "Active" || val == "Success" {
			return "#d1e7dd", "#0f5132", "✓"
		}
		if val == "Warning" || val == "Lag" {
			return "#fff3cd", "#664d03", "⚠"
		}
		if val == "Critical" || val == "Error" || val == "Failed" {
			return "#f8d7da", "#842029", "✗"
		}
		if val == "N/A" {
			return "#e2e3e5", "#41464b", "N/A"
		}
		return "#f8f9fa", "#212529", val
	}

	operatorName := c.MustGet("name").(string)

	if format == "excel" {
		c.Header("Content-Type", "application/vnd.ms-excel; charset=utf-8")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=Database_Checklist_Report_%s_%d.xls", monthName, yearVal))
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")

		var html strings.Builder
		html.WriteString(`
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <style>
        table { border-collapse: collapse; width: 100%; font-family: sans-serif; }
        th, td { border: 1px solid #000000; padding: 6px; text-align: center; }
        .header-title { font-size: 16px; font-weight: bold; text-align: left; }
        .section-header { background-color: #0F8A83; color: #ffffff; font-weight: bold; text-align: left; }
        .thead-dark { background-color: #f2f2f2; font-weight: bold; }
    </style>
</head>
<body>
    <table>
        <tr>
            <td colspan="33" class="header-title" style="border:none;">DAILY IT DATABASE CHECKLIST REPORT</td>
        </tr>
        <tr>
            <td colspan="33" style="border:none; text-align:left;">Periode: ` + monthName + ` ` + yearStr + `</td>
        </tr>
        <tr>
            <td colspan="33" style="border:none; text-align:left; padding-bottom: 20px;">Exported at: ` + time.Now().Format("2006-01-02 15:04:05") + `</td>
        </tr>
    </table>
`)

		for _, item := range []struct {
			Key   string
			Title string
		}{
			{"master", "Checklist Database Master"},
			{"slave", "Checklist Database Slave"},
		} {
			html.WriteString(`
<br>
<table>
    <thead>
        <tr>
            <th colspan="33" class="section-header" style="text-align:left; font-size:14px;">` + strings.ToUpper(item.Title) + `</th>
        </tr>
        <tr class="thead-dark">
            <th>No</th>
            <th style="text-align:left; width: 280px;">Parameter</th>`)
			for d := 1; d <= 31; d++ {
				html.WriteString(fmt.Sprintf("<th>%d</th>", d))
			}
			html.WriteString(`
        </tr>
    </thead>
    <tbody>`)

			for _, config := range paramsConfig {
				// Pagi
				html.WriteString(fmt.Sprintf(`
        <tr>
            <td>%d</td>
            <td style="text-align:left;">%s - Pagi</td>`, config.PagiNo, config.Label))
				for d := 1; d <= 31; d++ {
					val := "-"
					if ch, exists := dataMap[item.Key]["pagi"][d]; exists {
						switch config.Key {
						case "CPURAMStatus":
							val = ch.CPURAMStatus
						case "DiskStatus":
							val = ch.DiskStatus
						case "ReplicationStatus":
							val = ch.ReplicationStatus
						case "BackupStatus":
							val = ch.BackupStatus
						}
					}
					bg, color, text := getStatusStyles(val)
					html.WriteString(fmt.Sprintf(`<td style="background-color: %s; color: %s; font-weight: bold;">%s</td>`, bg, color, text))
				}
				html.WriteString("</tr>")

				// Sore
				html.WriteString(fmt.Sprintf(`
        <tr>
            <td>%d</td>
            <td style="text-align:left; font-style: italic; color: #555555; padding-left: 15px;">%s - Sore</td>`, config.SoreNo, config.Label))
				for d := 1; d <= 31; d++ {
					val := "-"
					if ch, exists := dataMap[item.Key]["sore"][d]; exists {
						switch config.Key {
						case "CPURAMStatus":
							val = ch.CPURAMStatus
						case "DiskStatus":
							val = ch.DiskStatus
						case "ReplicationStatus":
							val = ch.ReplicationStatus
						case "BackupStatus":
							val = ch.BackupStatus
						}
					}
					bg, color, text := getStatusStyles(val)
					html.WriteString(fmt.Sprintf(`<td style="background-color: %s; color: %s; font-weight: bold;">%s</td>`, bg, color, text))
				}
				html.WriteString("</tr>")
			}
			html.WriteString(`
    </tbody>
</table>`)
		}

		html.WriteString(`
</body>
</html>
`)
		c.String(http.StatusOK, html.String())
		return
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	var html strings.Builder
	html.WriteString(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Database_Checklist_Report_` + monthName + `_` + yearStr + `</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background: #ffffff; color: #000000; padding: 20px; font-size: 11px; }
        .report-title { font-size: 18px; font-weight: 700; border-bottom: 2px solid #000000; padding-bottom: 10px; margin-bottom: 20px; }
        table { font-size: 9px; width: 100%; border-collapse: collapse; margin-bottom: 25px; page-break-inside: avoid; }
        th, td { border: 1px solid #dee2e6 !important; padding: 6px 3px !important; text-align: center; vertical-align: middle; }
        th { background-color: #f8f9fa !important; font-weight: bold; }
        .param-col { text-align: left !important; font-weight: 500; font-size: 9.5px; }
        .section-header { background-color: #0F8A83 !important; color: #ffffff !important; text-align: left; font-weight: 700; font-size: 12px; }
        .status-ok { background-color: #d1e7dd !important; color: #0f5132 !important; }
        .status-warning { background-color: #fff3cd !important; color: #664d03 !important; }
        .status-error { background-color: #f8d7da !important; color: #842029 !important; }
        .status-na { background-color: #e2e3e5 !important; color: #41464b !important; }
        
        @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
            .section-header { background-color: #0F8A83 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #ffffff !important; }
            .status-ok { background-color: #d1e7dd !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .status-warning { background-color: #fff3cd !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .status-error { background-color: #f8d7da !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .status-na { background-color: #e2e3e5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="row mb-4 no-print bg-light p-3 rounded d-flex justify-content-between align-items-center">
            <div>
                <strong>DAILY IT DATABASE CHECKLIST REPORT</strong> &mdash; Periode: ` + monthName + ` ` + yearStr + `
            </div>
            <div>
                <button onclick="window.print();" class="btn btn-primary btn-sm px-3 me-2">
                    <i class="bi bi-printer me-1"></i> Print / Save as PDF
                </button>
                <button onclick="window.close();" class="btn btn-secondary btn-sm px-3">
                    Close
                </button>
            </div>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <h3 class="fw-bold m-0" style="font-size: 20px;">DAILY IT DATABASE CHECKLIST REPORT</h3>
                <div class="text-muted small mt-1">Periode: <strong>` + monthName + ` ` + yearStr + `</strong></div>
            </div>
            <div class="text-end text-muted small">
                Printed at: ` + time.Now().Format("2006-01-02 15:04:05") + `<br>
                Report Status: Final
            </div>
        </div>
        <hr class="mt-0 mb-4" style="border-top: 2px solid #000000; opacity: 1;">
`)

	for _, item := range []struct {
		Key   string
		Title string
	}{
		{"master", "Checklist Database Master"},
		{"slave", "Checklist Database Slave"},
	} {
		html.WriteString(`
        <table class="table table-bordered align-middle">
            <thead>
                <tr>
                    <th colspan="33" class="section-header py-2">` + strings.ToUpper(item.Title) + `</th>
                </tr>
                <tr>
                    <th style="width: 30px;">No</th>
                    <th class="text-start" style="width: 250px;">Parameter Checklist</th>`)
		for d := 1; d <= 31; d++ {
			html.WriteString(fmt.Sprintf(`<th style="width: 20px;">%d</th>`, d))
		}
		html.WriteString(`
                </tr>
            </thead>
            <tbody>`)

		for _, config := range paramsConfig {
			// Pagi
			html.WriteString(fmt.Sprintf(`
                <tr>
                    <td>%d</td>
                    <td class="param-col">%s - Pagi</td>`, config.PagiNo, config.Label))
			for d := 1; d <= 31; d++ {
				val := "-"
				if ch, exists := dataMap[item.Key]["pagi"][d]; exists {
					switch config.Key {
					case "CPURAMStatus":
						val = ch.CPURAMStatus
					case "DiskStatus":
						val = ch.DiskStatus
					case "ReplicationStatus":
						val = ch.ReplicationStatus
					case "BackupStatus":
						val = ch.BackupStatus
					}
				}
				_, _, text := getStatusStyles(val)
				class := ""
				if val == "Normal" || val == "Active" || val == "Success" {
					class = "status-ok"
				} else if val == "Warning" || val == "Lag" {
					class = "status-warning"
				} else if val == "Critical" || val == "Error" || val == "Failed" {
					class = "status-error"
				} else if val == "N/A" {
					class = "status-na"
				}
				html.WriteString(fmt.Sprintf(`<td class="%s fw-bold">%s</td>`, class, text))
			}
			html.WriteString("</tr>")

			// Sore
			html.WriteString(fmt.Sprintf(`
                <tr>
                    <td>%d</td>
                    <td class="param-col text-muted ps-3" style="font-style: italic;">%s - Sore</td>`, config.SoreNo, config.Label))
			for d := 1; d <= 31; d++ {
				val := "-"
				if ch, exists := dataMap[item.Key]["sore"][d]; exists {
					switch config.Key {
					case "CPURAMStatus":
						val = ch.CPURAMStatus
					case "DiskStatus":
						val = ch.DiskStatus
					case "ReplicationStatus":
						val = ch.ReplicationStatus
					case "BackupStatus":
						val = ch.BackupStatus
					}
				}
				_, _, text := getStatusStyles(val)
				class := ""
				if val == "Normal" || val == "Active" || val == "Success" {
					class = "status-ok"
				} else if val == "Warning" || val == "Lag" {
					class = "status-warning"
				} else if val == "Critical" || val == "Error" || val == "Failed" {
					class = "status-error"
				} else if val == "N/A" {
					class = "status-na"
				}
				html.WriteString(fmt.Sprintf(`<td class="%s fw-bold">%s</td>`, class, text))
			}
			html.WriteString("</tr>")
		}
		html.WriteString(`
            </tbody>
        </table>`)
	}

	html.WriteString(`
        <div class="row mt-4 pt-3" style="page-break-inside: avoid;">
            <div class="col-8">
                <h6 class="fw-bold mb-2">KETERANGAN STATUS:</h6>
                <div class="d-flex gap-4 text-muted small">
                    <div><strong>✓</strong> : Normal / Active / Success</div>
                    <div><strong>⚠</strong> : Warning / Lag</div>
                    <div><strong>✗</strong> : Critical / Error / Failed</div>
                    <div><strong>N/A</strong> : Not Applicable</div>
                    <div><strong>-</strong> : Belum Diisi</div>
                </div>
            </div>
            <div class="col-4 text-end">
                <div class="small text-muted mb-5">Prepared By,</div>
                <div class="fw-bold text-decoration-underline">` + operatorName + `</div>
                <div class="text-muted small">IT Database Administrator</div>
            </div>
        </div>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 500);
        }
    </script>
</body>
</html>
`)
	c.String(http.StatusOK, html.String())
}

func slugify(text string) string {
	text = strings.ToLower(text)
	var sb strings.Builder
	for _, r := range text {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			sb.WriteRune(r)
		} else if r == ' ' || r == '-' || r == '_' {
			sb.WriteRune('-')
		}
	}
	res := sb.String()
	for strings.Contains(res, "--") {
		res = strings.ReplaceAll(res, "--", "-")
	}
	return strings.Trim(res, "-")
}
