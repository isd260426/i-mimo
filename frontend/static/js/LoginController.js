/**
 * LoginController
 * Handles all login user interface events, form validation, and REST API authentication request processing.
 */
export default class LoginController {
    constructor(formId, alertContainerId) {
        this.form = document.getElementById(formId);
        this.alertContainer = document.getElementById(alertContainerId);
        
        if (!this.form) {
            console.error(`Form element with id "${formId}" not found.`);
            return;
        }

        this.usernameInput = this.form.querySelector('input[type="text"]');
        this.passwordInput = this.form.querySelector('input[type="password"]');
        this.rememberMeCheckbox = this.form.querySelector('#rememberMe');
        this.submitButton = this.form.querySelector('button[type="submit"]');
        this.passwordToggleBtn = this.form.querySelector('#togglePassword');
        this.passwordToggleIcon = this.form.querySelector('#togglePasswordIcon');

        this.init();
    }

    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));

        [this.usernameInput, this.passwordInput].forEach(input => {
            if (input) {
                input.addEventListener('input', () => this.clearInputError(input));
            }
        });

        if (this.passwordToggleBtn) {
            this.passwordToggleBtn.addEventListener('click', () => this.togglePasswordVisibility());
        }

        this.loadSavedUsername();
    }

    async handleSubmit(event) {
        event.preventDefault();
        this.clearAlerts();

        const username = this.usernameInput.value.trim();
        const password = this.passwordInput.value;

        let isValid = true;

        if (!username) {
            this.showInputError(this.usernameInput);
            isValid = false;
        }

        if (!password) {
            this.showInputError(this.passwordInput);
            isValid = false;
        }

        if (!isValid) {
            this.showAlert('danger', '<i class="bi bi-exclamation-triangle-fill"></i> Please fill in all required fields.');
            return;
        }

        this.setLoading(true);

        try {
            const response = await this.authenticate(username, password);
            
            if (response.success) {
                this.showAlert('success', '<i class="bi bi-check-circle-fill"></i> Login successful! Redirecting...');
                
                // Store JWT Token & user details securely
                localStorage.setItem('jwt_token', response.token);
                localStorage.setItem('user_name', response.user.name);
                localStorage.setItem('user_username', response.user.username);

                if (this.rememberMeCheckbox && this.rememberMeCheckbox.checked) {
                    localStorage.setItem('rememberedUsername', username);
                } else {
                    localStorage.removeItem('rememberedUsername');
                }

                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                    this.setLoading(false);
                }, 1500);

            } else {
                this.showAlert('danger', `<i class="bi bi-x-circle-fill"></i> ${response.message}`);
                this.setLoading(false);
            }
        } catch (error) {
            console.error('Authentication error:', error);
            this.showAlert('danger', '<i class="bi bi-exclamation-octagon-fill"></i> An unexpected error occurred. Please try again.');
            this.setLoading(false);
        }
    }

    showInputError(inputElement) {
        const inputGroup = inputElement.closest('.input-group');
        if (inputGroup) {
            inputGroup.classList.add('is-invalid');
        }
    }

    clearInputError(inputElement) {
        const inputGroup = inputElement.closest('.input-group');
        if (inputGroup) {
            inputGroup.classList.remove('is-invalid');
        }
    }

    setLoading(isLoading) {
        if (isLoading) {
            this.usernameInput.disabled = true;
            this.passwordInput.disabled = true;
            if (this.rememberMeCheckbox) this.rememberMeCheckbox.disabled = true;
            if (this.passwordToggleBtn) this.passwordToggleBtn.disabled = true;
            this.submitButton.disabled = true;
            this.submitButton.innerHTML = `
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                Logging in...
            `;
        } else {
            this.usernameInput.disabled = false;
            this.passwordInput.disabled = false;
            if (this.rememberMeCheckbox) this.rememberMeCheckbox.disabled = false;
            if (this.passwordToggleBtn) this.passwordToggleBtn.disabled = false;
            this.submitButton.disabled = false;
            this.submitButton.innerHTML = `
                Login <i class="bi bi-box-arrow-in-right ms-1"></i>
            `;
        }
    }

    showAlert(type, htmlMessage) {
        if (!this.alertContainer) return;
        
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.innerHTML = htmlMessage;
        
        this.alertContainer.innerHTML = '';
        this.alertContainer.appendChild(alertDiv);
    }

    clearAlerts() {
        if (this.alertContainer) {
            this.alertContainer.innerHTML = '';
        }
    }

    async authenticate(username, password) {
        const apiHost = window.location.origin; // Points to Nginx, which proxies to Backend
        // Or default fallback to local backend NodePort in local dev environment
        const apiURL = apiHost.includes('127.0.0.1') || apiHost.includes('localhost')
            ? 'http://127.0.0.1:30200/api/v1/auth/login'
            : '/api/v1/auth/login';

        const response = await fetch(apiURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        return await response.json();
    }

    loadSavedUsername() {
        const savedUsername = localStorage.getItem('rememberedUsername');
        if (savedUsername && this.usernameInput) {
            this.usernameInput.value = savedUsername;
            if (this.rememberMeCheckbox) {
                this.rememberMeCheckbox.checked = true;
            }
        }
    }

    togglePasswordVisibility() {
        if (!this.passwordInput || !this.passwordToggleIcon) return;

        if (this.passwordInput.type === 'password') {
            this.passwordInput.type = 'text';
            this.passwordToggleIcon.classList.remove('bi-eye-slash-fill');
            this.passwordToggleIcon.classList.add('bi-eye-fill');
        } else {
            this.passwordInput.type = 'password';
            this.passwordToggleIcon.classList.remove('bi-eye-fill');
            this.passwordToggleIcon.classList.add('bi-eye-slash-fill');
        }
    }
}
