document.addEventListener('DOMContentLoaded', () => {
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        const strengthMessageDiv = document.getElementById('password-strength-message');
        const matchMessageDiv = document.getElementById('password-match-message');
        const registerButton = document.getElementById('register-button');

        const checkFormValidity = () => {
            const isPasswordValid = passwordInput.value.length >= 6;
            const arePasswordsMatching = passwordInput.value === confirmPasswordInput.value;
            
            // Register button tabhi enable hoga jab password valid ho aur dono match karein
            registerButton.disabled = !(isPasswordValid && arePasswordsMatching);
        };

        const validatePasswordStrength = () => {
            const password = passwordInput.value;
            if (password.length > 0 && password.length < 6) {
                strengthMessageDiv.textContent = 'Password must be at least 6 characters long.';
                strengthMessageDiv.className = 'text-sm mt-2 text-red-600';
            } else {
                strengthMessageDiv.textContent = '';
            }
            checkFormValidity();
        };

        const validatePasswordMatch = () => {
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (confirmPassword === '') {
                matchMessageDiv.textContent = '';
                confirmPasswordInput.classList.remove('border-red-500', 'border-green-500');
            } else if (password === confirmPassword) {
                matchMessageDiv.textContent = '✅ Passwords match!';
                matchMessageDiv.className = 'text-sm mt-2 text-green-600';
                confirmPasswordInput.classList.remove('border-red-500');
                confirmPasswordInput.classList.add('border-green-500');
            } else {
                matchMessageDiv.textContent = '❌ Passwords do not match.';
                matchMessageDiv.className = 'text-sm mt-2 text-red-600';
                confirmPasswordInput.classList.remove('border-green-500');
                confirmPasswordInput.classList.add('border-red-500');
            }
            checkFormValidity();
        };

        passwordInput.addEventListener('input', () => {
            validatePasswordStrength();
            validatePasswordMatch(); // Check match again if main password changes
        });
        confirmPasswordInput.addEventListener('input', validatePasswordMatch);
    });