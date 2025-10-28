const API_BASE = 'http://localhost:3000/api';
let currentUser = null;
let authToken = localStorage.getItem('authToken');

// Centralized auth token getter and fetch wrapper
function getAuthToken() {
    return localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('accessToken') || null;
}

async function apiFetch(path, options = {}) {
    const token = getAuthToken();
    const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : '/' + path}`;

    const headers = new Headers(options.headers || {});

    if (token) headers.set('Authorization', `Bearer ${token}`);

    // If body is JSON and Content-Type is not set, set it
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const opts = Object.assign({}, options, { headers });

    const res = await fetch(url, opts);

    if (res.status === 401) {
        // Clear stored tokens and redirect to login
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        localStorage.removeItem('accessToken');
        // slight delay to allow UI update
        setTimeout(() => { window.location.href = '/'; }, 800);
    }

    return res;
}
let selectedFiles = []; // Global variable to store selected files

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    if (authToken) {
        checkAuthStatus();
    }

    // Event Listeners
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Registration form
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Password change form
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.addEventListener('submit', handlePasswordChange);
    }

    // Event delegation for navigation tabs
    document.addEventListener('click', function(e) {
        console.log('🖱️ Click event on:', e.target.tagName, e.target.className, e.target.textContent);
        
        // Navigation tabs
        if (e.target.matches('[data-tab]')) {
            const tabName = e.target.getAttribute('data-tab');
            showTab(tabName, e);
        }

        // Action buttons
        if (e.target.matches('[data-action="show-tab"]')) {
            const targetTab = e.target.getAttribute('data-target');
            showTab(targetTab, e);
        }

        // Logout button
        if (e.target.matches('[data-action="logout"]')) {
            logout();
        }

        // Mark all as read button
        if (e.target.matches('[data-action="mark-all-read"]')) {
            markAllAsRead();
        }

        // Calculate hours button
        if (e.target.matches('[data-action="calculate-hours"]')) {
            calculateHours();
        }

        // Add attachment button
        if (e.target.matches('[data-action="add-attachment"]')) {
            addAttachment();
        }

        // Save default balance button
        if (e.target.matches('[data-action="save-default-balance"]')) {
            saveDefaultBalance();
        }

        // Refresh approvals button
        if (e.target.matches('[data-action="refresh-approvals"]')) {
            loadLeaveApprovals();
        }

        // Notification items
        if (e.target.closest('.notification-item')) {
            const notificationItem = e.target.closest('.notification-item');
            const notificationId = notificationItem.getAttribute('data-notification-id');
            const relatedType = notificationItem.getAttribute('data-related-type');
            const relatedId = notificationItem.getAttribute('data-related-id');
            if (notificationId) {
                // Open notification (marks as read and navigates if related)
                openNotification(notificationId, relatedType, relatedId);
            }
        }
    });

    // Add event listeners for select elements to handle floating labels
    const selectElements = document.querySelectorAll('.form-group select');
    selectElements.forEach(select => {
        select.addEventListener('change', function() {
            const label = this.nextElementSibling; // Label is now after the input/select
            if (label && label.tagName === 'LABEL') {
                if (this.value) {
                    label.style.top = '-8px';
                    label.style.left = '12px';
                    label.style.fontSize = '0.75rem';
                    label.style.color = 'rgba(255, 255, 255, 0.9)';
                    label.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                    label.style.padding = '0 6px';
                    label.style.borderRadius = '4px';
                    label.style.fontWeight = '600';
                    label.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                } else {
                    label.style = ''; // Reset styles
                }
            }
        });
    });

    // Check authentication status on page load only if token exists
    if (authToken) {
        checkAuthStatus();
    }
});

// Tab switching function
function showTab(tabName, event) {
    console.log('🔄 Switching to tab:', tabName);
    
    // Remove active class from all tabs and content
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to clicked tab
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Show corresponding content
    const targetContent = document.getElementById(tabName);
    if (targetContent) {
        targetContent.classList.add('active');
        
        // Load specific data based on tab
        switch (tabName) {
            case 'leave-approvals':
                if (currentUser && ['manager', 'hr', 'admin'].includes(currentUser.role)) {
                    loadLeaveApprovals();
                }
                break;
            case 'my-leaves':
                loadMyLeaves();
                break;
            case 'notifications':
                loadNotifications();
                break;
            case 'admin':
                if (currentUser && ['hr', 'admin'].includes(currentUser.role)) {
                    loadAdminData();
                }
                break;
            case 'leave-balance':
                if (currentUser && ['hr', 'admin'].includes(currentUser.role)) {
                    loadLeaveBalances();
                }
                break;
            case 'audit-logs':
                if (currentUser && ['hr', 'admin'].includes(currentUser.role)) {
                    loadAuditLogs();
                }
                break;
        }
    } else {
        console.error('❌ Tab content not found:', tabName);
    }
}

// Check authentication status and update UI
async function checkAuthStatus() {
    if (!authToken) {
        showLoginForm();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const userData = await response.json();
            currentUser = userData.user;
            showDashboard();
            updateUserInfo();
            showTabsByRole();
        } else {
            // Token is invalid or expired
            localStorage.removeItem('authToken');
            authToken = null;
            currentUser = null;
            showLoginForm();
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        showLoginForm();
    }
}

// Show tabs based on user role
function showTabsByRole() {
    if (!currentUser) return;

    // Hide all role-specific tabs first
    document.querySelectorAll('.manager-only, .admin-only, .hr-only').forEach(tab => {
        tab.style.display = 'none';
    });

    // Show tabs based on role
    if (['manager', 'hr', 'admin'].includes(currentUser.role)) {
        document.querySelectorAll('.manager-only').forEach(tab => {
            tab.style.display = 'block';
        });
    }

    if (['hr', 'admin'].includes(currentUser.role)) {
        document.querySelectorAll('.hr-only, .admin-only').forEach(tab => {
            tab.style.display = 'block';
        });
    }
}

// Show login form
function showLoginForm() {
    const authSection = document.getElementById('auth-section');
    const dashboard = document.getElementById('dashboard');
    if (authSection) authSection.style.display = 'block';
    if (dashboard) dashboard.style.display = 'none';
}

// Show dashboard
function showDashboard() {
    const authSection = document.getElementById('auth-section');
    const dashboard = document.getElementById('dashboard');
    if (authSection) authSection.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
}

// Update user information in the UI
function updateUserInfo() {
    if (!currentUser) return;
    
    document.getElementById('user-name').textContent = currentUser.firstName;
    document.getElementById('user-employee-id').textContent = currentUser.employeeId;
    document.getElementById('user-employee-id-display').textContent = currentUser.employeeId;
    
    // Load user-specific data
    loadUserLeaveBalances();
    loadNotifications();
}

    // Add event listeners for forms when they are dynamically loaded
    document.addEventListener('submit', function(e) {
        console.log('Form submit event triggered:', e.target.id);
        if (e.target.id === 'leave-form') {
            e.preventDefault();
            console.log('Leave form submit detected');
            
            // Check form validation
            const form = e.target;
            if (!form.checkValidity()) {
                console.log('Form validation failed');
                form.reportValidity();
                return;
            }
            
            console.log('Form validation passed');
            handleLeaveRequest(e);
        }
        if (e.target.id === 'profile-form') {
            e.preventDefault();
            handleProfileUpdate(e);
        }
    });
    
    // Add click event listener for the submit button as backup
    document.addEventListener('click', function(e) {
        if (e.target.matches('#leave-form button[type="submit"]')) {
            console.log('Submit button clicked directly');
            // Trigger form submission manually
            const form = e.target.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true }));
            }
        }
    });
    
    // Add direct event listener for the leave form
    setTimeout(() => {
        const leaveForm = document.getElementById('leave-form');
        if (leaveForm) {
            if (!leaveForm.dataset.listenerAdded) {
                console.log('Adding direct event listener to leave form');
                leaveForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    console.log('Direct leave form submit detected');
                    handleLeaveRequest(e);
                });
                leaveForm.dataset.listenerAdded = 'true';
            } else {
                console.debug('Leave form submit listener already added - skipping');
            }
        }
        
        const submitBtn = document.querySelector('#leave-form button[type="submit"]');
        if (submitBtn) {
            if (!submitBtn.dataset.listenerAdded) {
                console.log('Adding direct click listener to submit button');
                submitBtn.addEventListener('click', function(e) {
                    console.log('Submit button clicked via direct listener');
                    const form = this.closest('form');
                    if (form) {
                        form.dispatchEvent(new Event('submit', { bubbles: true }));
                    }
                });
                submitBtn.dataset.listenerAdded = 'true';
            } else {
                console.debug('Submit button click listener already added - skipping');
            }
        }
    }, 1000);
    
    // Add additional debugging for form elements
    document.addEventListener('DOMContentLoaded', function() {
        const leaveForm = document.getElementById('leave-form');
        if (leaveForm) {
            console.log('Leave form found:', leaveForm);
            const submitBtn = leaveForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                console.log('Submit button found:', submitBtn);
                // Store original text for loading state
                submitBtn.setAttribute('data-original-text', submitBtn.innerHTML);
            }
        }
    });

    // Add event listeners for date/time calculations
    document.addEventListener('change', function(e) {
        if (e.target.id === 'start-date' || e.target.id === 'leave-hours') {
            calculateEndDate();
        }
    });

    // Add event listeners for filters
    document.addEventListener('change', function(e) {
        if (e.target.id === 'status-filter') {
            filterLeaves();
        }
        if (e.target.id === 'approval-status-filter') {
            filterApprovals();
        }
    });

    // Capture live input for fallback during login
    document.addEventListener('input', function(e) {
        if (e.target && e.target.id === 'login-email') {
            window.__lastTypedEmail = e.target.value;
        }
        if (e.target && e.target.id === 'login-password') {
            window.__lastTypedPassword = e.target.value;
        }
        if (e.target.id === 'search-leaves') {
            filterLeaves();
        }
        if (e.target.id === 'search-approvals') {
            filterApprovals();
        }
    });

    // Add event listener for hire date input
    document.addEventListener('focus', function(e) {
        if (e.target.id === 'reg-hireDate') {
            const today = new Date().toISOString().split('T')[0];
            e.target.setAttribute('max', today);
        }
    }, true);

async function handleRegister(e) {
    e.preventDefault();
    console.log('Registration form submitted');
    showLoading('register-form');
    
    // Ensure admin is logged in
    const token = localStorage.getItem('authToken');
    if (!token || !currentUser || currentUser.role !== 'admin') {
        hideLoading('register-form');
        showAlert('Please login as an admin to register employees.', 'error');
        return;
    }

    const data = {
        employeeId: document.getElementById('reg-employeeId').value,
        firstName: document.getElementById('reg-firstName').value,
        lastName: document.getElementById('reg-lastName').value,
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-password').value,
        department: document.getElementById('reg-department').value,
        position: document.getElementById('reg-position').value,
        role: document.getElementById('reg-role').value,
        hireDate: document.getElementById('reg-hireDate').value
    };
    
    console.log('Registration data:', data);

    try {
        const response = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        let result = null;
        try {
            result = await response.json();
        } catch (_) {
            result = { message: 'Unexpected server response' };
        }

        if (response.ok) {
            showAlert('Employee registered successfully.', 'success');
            e.target.reset();
        } else {
            showAlert(result.message || result.error || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showAlert('Network error. Please try again.', 'error');
    } finally {
        hideLoading('register-form');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    console.log('Login form submitted');
    showLoading('login-form');
    
    const form = document.getElementById('login-form') || (e.currentTarget || e.target);
    const fd = form ? new FormData(form) : null;
    let email = fd ? fd.get('email') : null;
    let password = fd ? fd.get('password') : null;
    if (!email) {
        email = (form && form.querySelector('#login-email') && form.querySelector('#login-email').value)
            || (document.getElementById('login-email') && document.getElementById('login-email').value)
            || window.__lastTypedEmail || '';
    }
    if (!password) {
        password = (form && form.querySelector('#login-password') && form.querySelector('#login-password').value)
            || (document.getElementById('login-password') && document.getElementById('login-password').value)
            || window.__lastTypedPassword || '';
    }
    if (!email || !password) {
        console.error('Email/password missing', { hasForm: !!form, emailPresent: !!email, passwordPresent: !!password });
        hideLoading('login-form');
        showAlert('Please enter email and password', 'error');
        return;
    }

    const data = { email, password };
    
    console.log('Login data:', data);

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            authToken = result.token;
            localStorage.setItem('authToken', authToken);
            currentUser = result.user;
            
            showAlert('Login successful!', 'success');
            showDashboard();
            updateUserInfo();
            showTabsByRole();
        } else {
            showAlert(result.message || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Network error. Please try again.', 'error');
    } finally {
        hideLoading('login-form');
    }
}

async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            currentUser = await response.json();
            showDashboard();
            loadDashboardData();
        } else {
            localStorage.removeItem('authToken');
            authToken = null;
        }
    } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('authToken');
        authToken = null;
    }
}

function showDashboard() {
    console.log('showDashboard called');
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    updateUserInfo();
}

function updateUserInfo() {
    console.log('updateUserInfo called, currentUser:', currentUser);
    if (currentUser) {
        const userNameElement = document.getElementById('user-name');
        const userRoleElement = document.getElementById('user-role');
        const userAvatarElement = document.getElementById('user-avatar');
        const userEmployeeIdElement = document.getElementById('user-employee-id');
        const profileNameElement = document.getElementById('profile-name');
        const profileEmailElement = document.getElementById('profile-email');
        const profileRoleElement = document.getElementById('profile-role');
        const profileAvatarElement = document.getElementById('profile-avatar');
        const profileFirstNameElement = document.getElementById('profile-firstName');
        
        
        console.log('userNameElement found:', !!userNameElement);
        if (userNameElement) {
            const fullName = `${currentUser.firstName} ${currentUser.lastName}`;
            console.log('Setting user name to:', fullName);
            userNameElement.textContent = fullName;
        }
        if (userRoleElement) userRoleElement.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
        if (userAvatarElement) userAvatarElement.textContent = currentUser.firstName.charAt(0) + currentUser.lastName.charAt(0);
        if (userEmployeeIdElement) userEmployeeIdElement.textContent = currentUser.employeeId || 'N/A';
        
        if (profileNameElement) profileNameElement.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
        if (profileEmailElement) profileEmailElement.textContent = currentUser.email;
        if (profileRoleElement) profileRoleElement.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
        if (profileAvatarElement) profileAvatarElement.textContent = currentUser.firstName.charAt(0) + currentUser.lastName.charAt(0);
        
        // Populate profile form
        const profileFirstName = document.getElementById('profile-firstName');
        const profileLastName = document.getElementById('profile-lastName');
        const profileEmail = document.getElementById('profile-email');
        const profileDepartment = document.getElementById('profile-department');
        const profilePosition = document.getElementById('profile-position');
        
        if (profileFirstName) profileFirstName.value = currentUser.firstName;
        if (profileLastName) profileLastName.value = currentUser.lastName;
        if (profileEmail) profileEmail.value = currentUser.email;
        if (profileDepartment) profileDepartment.value = currentUser.department;
        if (profilePosition) profilePosition.value = currentUser.position;
        
        // Show/hide admin tabs based on user role
        const adminTabs = document.querySelectorAll('.admin-only');
        console.log('Admin tabs found:', adminTabs.length);
        console.log('Current user role:', currentUser.role);
        adminTabs.forEach(tab => {
            if (currentUser.role === 'admin') {
                tab.style.display = 'block';
                console.log('Showing admin tab:', tab.textContent);
            } else {
                tab.style.display = 'none';
                console.log('Hiding admin tab:', tab.textContent);
            }
        });
    }
}

async function loadDashboardData() {
    try {
        await Promise.all([
            loadLeaveStats(),
            loadLeaveTypes(),
            loadUserLeaves(),
            loadNotifications(),
            loadUserLeaveBalance()
        ]);
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

async function loadLeaveStats() {
    try {
        const response = await apiFetch('/leaves');

        if (response.ok) {
            const leaves = await response.json();
            const stats = {
                total: leaves.length,
                pending: leaves.filter(l => l.status === 'pending').length,
                approved: leaves.filter(l => l.status === 'approved').length,
                remaining: 20 // This would come from leave balance API
            };

            const totalLeavesElement = document.getElementById('total-leaves');
            const pendingLeavesElement = document.getElementById('pending-leaves');
            const approvedLeavesElement = document.getElementById('approved-leaves');
            const remainingBalanceElement = document.getElementById('remaining-balance');
            
            if (totalLeavesElement) totalLeavesElement.textContent = stats.total;
            if (pendingLeavesElement) pendingLeavesElement.textContent = stats.pending;
            if (approvedLeavesElement) approvedLeavesElement.textContent = stats.approved;
            if (remainingBalanceElement) remainingBalanceElement.textContent = stats.remaining;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadLeaveTypes() {
    try {
        const response = await fetch(`${API_BASE}/leaves/types`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const select = document.getElementById('leave-type');
        if (!select) return;

        if (response.ok) {
            const types = await response.json();
            select.innerHTML = '<option value="">Select Leave Type</option>';
            types.forEach(type => {
                const option = document.createElement('option');
                option.value = type.id;
                option.textContent = type.name;
                select.appendChild(option);
            });
        } else {
            // Add default leave types if API fails
            select.innerHTML = `
                <option value="">Select Leave Type</option>
                <option value="1">Annual Leave</option>
                <option value="2">Sick Leave</option>
                <option value="3">Personal Leave</option>
                <option value="4">Maternity Leave</option>
                <option value="5">Paternity Leave</option>
            `;
        }
    } catch (error) {
        console.error('Error loading leave types:', error);
        const select = document.getElementById('leave-type');
        if (select) {
            select.innerHTML = `
                <option value="">Select Leave Type</option>
                <option value="1">Annual Leave</option>
                <option value="2">Sick Leave</option>
                <option value="3">Personal Leave</option>
                <option value="4">Maternity Leave</option>
                <option value="5">Paternity Leave</option>
            `;
        }
    }
}

async function loadUserLeaves() {
    try {
        const response = await apiFetch('/leaves');

        if (response.ok) {
            const leaves = await response.json();
            displayLeaves(leaves);
        } else {
            displayLeaves([]);
        }
    } catch (error) {
        console.error('Error loading leaves:', error);
        displayLeaves([]);
    }
}

function displayLeaves(leaves) {
    const container = document.getElementById('leaves-list');
    if (!container) return;
    if (!Array.isArray(leaves) || leaves.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #718096;">No leave requests found.</p>';
        return;
    }

    // Deduplicate leaves by id (sometimes duplicates can appear from joins or accidental re-fetches)
    const byId = new Map();
    for (const l of leaves) {
        if (!l) continue;
        // Prefer object with id; if missing, try createdAt fallback key (unlikely)
        const key = l.id || `${l.startDate}_${l.endDate}_${l.numberOfDays}_${l.reason}`;
        if (!byId.has(key)) byId.set(key, l);
    }

    const uniqueLeaves = Array.from(byId.values());

    // Sort by createdAt descending if available, otherwise keep original order
    uniqueLeaves.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
    });

    // Quick-render dedupe: avoid re-rendering identical lists repeatedly (helps if load is called multiple times)
    try {
        const idList = uniqueLeaves.map(l => l.id || `${l.startDate}_${l.endDate}_${l.numberOfDays}`).join(',');
        if (container.dataset.lastLeaves === idList) {
            // already rendered same list recently
            console.debug('displayLeaves: skipping render, list unchanged');
            return;
        }
        container.dataset.lastLeaves = idList;
    } catch (e) {
        // ignore hashing errors and continue to render
    }

    container.innerHTML = uniqueLeaves.map(leave => `
        <div class="leave-item" data-leave-id="${leave.id || ''}">
            <div>
                <h4>${leave.reason}</h4>
                <p>${new Date(leave.startDate).toLocaleDateString()} - ${new Date(leave.endDate).toLocaleDateString()}</p>
                <p>${leave.numberOfDays} days</p>
            </div>
            <span class="leave-status status-${leave.status}">${(leave.status || '').toUpperCase()}</span>
        </div>
    `).join('');
}

async function loadNotifications() {
    try {
        const response = await fetch(`${API_BASE}/notifications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            // API returns { notifications: [...], pagination: {...} }
            const body = await response.json();
            const notifications = Array.isArray(body) ? body : (body.notifications || []);
            displayNotifications(notifications);
        } else {
            displayNotifications([]);
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        displayNotifications([]);
    }
}

function displayNotifications(notifications) {
    const container = document.getElementById('notifications-list');
    const countElement = document.getElementById('notification-count');
    
    if (!container) return;
    
    // Ensure notifications is an array
    if (!Array.isArray(notifications)) {
        console.warn('Notifications is not an array:', notifications);
        notifications = [];
    }
    
    if (notifications.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #718096;">No notifications found.</p>';
        if (countElement) countElement.textContent = '0 notifications';
        return;
    }

    if (countElement) {
        const unreadCount = notifications.filter(n => !n.isRead).length;
        countElement.textContent = `${notifications.length} notifications (${unreadCount} unread)`;
    }

    container.innerHTML = notifications.map(notification => `
        <div class="notification-item ${notification.isRead ? '' : 'unread'}" data-notification-id="${notification.id}" data-related-type="${notification.relatedType || ''}" data-related-id="${notification.relatedId || ''}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4 style="margin:0">${notification.title}</h4>
              ${notification.recipientRole ? `<small class="badge">${notification.recipientRole}</small>` : ''}
            </div>
            <p>${notification.message}</p>
            <small>${new Date(notification.createdAt).toLocaleString()}</small>
        </div>
    `).join('');
}

// Open a notification: mark it read and navigate/open related resource if present
async function openNotification(notificationId, relatedType, relatedId) {
    try {
        // Mark as read first
        await markAsRead(notificationId);

            // If notification is related to a leave request, open the dedicated review page
            if (relatedType === 'leave' && relatedId) {
                // Navigate to the dedicated review page with leaveId as query param
                // The new page will handle auth and role checks and present the review UI for managers
                window.location.href = `/leave-review.html?leaveId=${relatedId}`;
                return;
            }
    } catch (err) {
        console.error('Error opening notification:', err);
    }
}

async function handleLeaveRequest(e) {
    e.preventDefault();
    console.log('=== LEAVE REQUEST DEBUG START ===');
    console.log('handleLeaveRequest called');
    console.log('Event target:', e.target);
    console.log('Auth token exists:', !!authToken);
    console.log('Auth token length:', authToken ? authToken.length : 0);
    
    showLoading('leave-form');
    
    // Wait for form elements to be available with retry logic
    let startDateEl, endDateEl, hoursEl, leaveTypeEl, commentsEl;
    let attempts = 0;
    const maxAttempts = 20; // Increased attempts
    
    console.log('=== STARTING FORM ELEMENT DETECTION ===');
    console.log('Document ready state:', document.readyState);
    console.log('Current URL:', window.location.href);
    
    while (attempts < maxAttempts) {
        startDateEl = document.getElementById('start-date');
        endDateEl = document.getElementById('end-date');
        hoursEl = document.getElementById('leave-hours');
        leaveTypeEl = document.getElementById('leave-type');
        commentsEl = document.getElementById('leave-comments');
        
        console.log(`Attempt ${attempts + 1}:`, {
            startDateEl: !!startDateEl,
            endDateEl: !!endDateEl,
            hoursEl: !!hoursEl,
            leaveTypeEl: !!leaveTypeEl,
            commentsEl: !!commentsEl
        });
        
        if (startDateEl && endDateEl && hoursEl && leaveTypeEl && commentsEl) {
            console.log('✅ All form elements found!');
            break;
        }
        
        // Wait longer between attempts
        await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms
        attempts++;
    }
    
    console.log('=== FORM ELEMENT DETECTION COMPLETE ===');
    console.log('Final form elements found:', {
        startDateEl: startDateEl,
        endDateEl: endDateEl,
        hoursEl: hoursEl,
        leaveTypeEl: leaveTypeEl,
        commentsEl: commentsEl
    });
    
    // Comprehensive DOM debugging
    console.log('=== DOM DEBUGGING ===');
    console.log('Document body children count:', document.body.children.length);
    console.log('All elements with start-date ID:', document.querySelectorAll('#start-date'));
    console.log('All elements with end-date ID:', document.querySelectorAll('#end-date'));
    console.log('All elements with leave-hours ID:', document.querySelectorAll('#leave-hours'));
    console.log('All elements with leave-type ID:', document.querySelectorAll('#leave-type'));
    console.log('All elements with leave-comments ID:', document.querySelectorAll('#leave-comments'));
    
    // Check if the form exists and what's inside it
    const leaveForm = document.getElementById('leave-form');
    console.log('Leave form element:', leaveForm);
    if (leaveForm) {
        console.log('Form innerHTML length:', leaveForm.innerHTML.length);
        console.log('Form innerHTML preview:', leaveForm.innerHTML.substring(0, 500));
        console.log('Form contains start-date:', leaveForm.querySelector('#start-date'));
        console.log('Form contains end-date:', leaveForm.querySelector('#end-date'));
        console.log('Form contains leave-hours:', leaveForm.querySelector('#leave-hours'));
        console.log('Form contains leave-type:', leaveForm.querySelector('#leave-type'));
        console.log('Form contains leave-comments:', leaveForm.querySelector('#leave-comments'));
    } else {
        console.log('❌ Leave form not found!');
    }
    
    // Check for any JavaScript errors
    console.log('=== JAVASCRIPT ERROR CHECK ===');
    if (window.onerror) {
        console.log('Global error handler exists');
    }
    
    // Check if we're in the right tab
    const currentTab = document.querySelector('.tab-content[style*="block"]');
    console.log('Current visible tab:', currentTab ? currentTab.id : 'none');

    if (!startDateEl || !endDateEl || !hoursEl || !leaveTypeEl || !commentsEl) {
        console.error('Leave form inputs not found:', {
            startDateEl: !!startDateEl,
            endDateEl: !!endDateEl,
            hoursEl: !!hoursEl,
            leaveTypeEl: !!leaveTypeEl,
            commentsEl: !!commentsEl
        });
        showAlert('Leave form is not fully loaded. Please try again.', 'error');
        hideLoading('leave-form');
        return;
    }

    const startDate = startDateEl.value;
    const endDate = endDateEl.value;
    const hours = parseFloat(hoursEl.value || '0') || 0;
    const leaveTypeId = leaveTypeEl.value;
    const comments = commentsEl.value;
    
    console.log('Form data collected:', { startDate, endDate, hours, leaveTypeId, comments });
    console.log('Selected files count:', selectedFiles.length);
    if (selectedFiles.length > 0) {
        console.log('Selected file:', selectedFiles[0].name, selectedFiles[0].size);
    }
    
    // Validate required fields
    if (!startDate || !endDate || !leaveTypeId) {
        console.log('Missing required fields');
        console.log('- Start date:', !!startDate);
        console.log('- End date:', !!endDate);
        console.log('- Leave type:', !!leaveTypeId);
        showAlert('Please fill in all required fields (Leave Type, Start Date, End Date)', 'error');
        hideLoading('leave-form');
        return;
    }
    
    // Calculate days from hours (assuming 8 hours per day)
    const numberOfDays = hours / 8;
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('leaveTypeId', leaveTypeId);
    formData.append('startDate', startDate);
    formData.append('endDate', endDate);
    formData.append('numberOfDays', numberOfDays);
    formData.append('numberOfHours', hours);
    formData.append('reason', comments || 'Leave request for personal time off');
    formData.append('comments', comments);
    
    // Add files to FormData
    if (selectedFiles.length > 0) {
        selectedFiles.forEach((file, index) => {
            console.log('Adding file to FormData:', file.name);
            formData.append('attachment', file);
        });
    }
    
    console.log('Data being sent:', {
        leaveTypeId, startDate, endDate, numberOfDays, numberOfHours: hours,
        reason: comments || 'Leave request for personal time off',
        comments, filesCount: selectedFiles.length
    });
    
    // Add additional validation
    if (new Date(startDate) > new Date(endDate)) {
        console.log('Start date is after end date');
        showAlert('Start date cannot be after end date', 'error');
        hideLoading('leave-form');
        return;
    }
    
    // Add more detailed validation logging
    console.log('Validation checks:');
    console.log('- Start date valid:', !!startDate);
    console.log('- End date valid:', !!endDate);
    console.log('- Leave type selected:', !!leaveTypeId);
    console.log('- Hours entered:', hours);
    console.log('- Date range valid:', new Date(startDate) <= new Date(endDate));
    console.log('- Files selected:', selectedFiles.length);

    try {
        console.log('Making API call to:', `${API_BASE}/leaves`);
        console.log('Request method: POST');
        const response = await apiFetch('/leaves', {
            method: 'POST',
            body: formData // apiFetch will attach Authorization header and will not override Content-Type for FormData
        });

        console.log('Response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });

        const result = await response.json();
        console.log('Response JSON:', result);

        if (response.ok) {
            console.log('Leave request submitted successfully!');
            showAlert('Leave request submitted successfully!', 'success');
            e.target.reset();
            // Clear selected files
            selectedFiles = [];
            displaySelectedFiles();
            loadDashboardData();
        } else {
            console.log('API returned error:', result);
            showAlert(result.message || 'Failed to submit leave request', 'error');
        }
    } catch (error) {
        console.error('Leave request error:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        showAlert('Network error. Please try again.', 'error');
    } finally {
        hideLoading('leave-form');
        console.log('=== LEAVE REQUEST DEBUG END ===');
    }
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    console.log('Profile update form submitted');
    
    // Implementation for profile update
    showAlert('Profile update functionality not implemented yet', 'info');
}

async function handlePasswordChange(e) {
    e.preventDefault();
    console.log('Password change form submitted');
    
    // Implementation for password change
    showAlert('Password change functionality not implemented yet', 'info');
}

function showTab(tabName, event) {
    console.log('Switching to tab:', tabName);
    
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected tab content
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
        console.log('Tab content shown:', tabName);
    } else {
        console.error('Tab content not found:', tabName);
    }

    // Add active class to clicked tab
    if (event && event.target) {
        event.target.classList.add('active');
    }

    // Load specific data for the tab
    switch(tabName) {
        case 'overview':
            loadDashboardData();
            break;
        case 'my-leaves':
            loadUserLeaves();
            break;
        case 'notifications':
            loadNotifications();
            break;
        case 'leave-balance':
            loadLeaveBalanceData();
            break;
        case 'audit-logs':
            loadAuditLogs();
            break;
    }
}

function logout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    showLoginForm();
    showAlert('Logged out successfully', 'info');
}

function showAlert(message, type = 'info') {
    // Create and show alert message
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    document.body.appendChild(alert);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
    }, 5000);
}

function showLoading(formId) {
    const form = document.getElementById(formId);
    if (form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            // Preserve original text once
            if (!submitBtn.getAttribute('data-original-text')) {
                submitBtn.setAttribute('data-original-text', submitBtn.innerHTML);
            }
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        }
    }
}

function hideLoading(formId) {
    const form = document.getElementById(formId);
    if (form) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = submitBtn.getAttribute('data-original-text') || submitBtn.innerHTML || 'Submit';
        }
    }
}

function calculateEndDate() {
    const startInput = document.getElementById('start-date');
    const hoursInput = document.getElementById('leave-hours');
    const endInput = document.getElementById('end-date');
    if (!startInput || !hoursInput || !endInput) return;

    const startDate = startInput.value;
    const hours = parseFloat(hoursInput.value || '0');
    const numberOfDays = hours > 0 ? hours / 8 : 0; // Assume 8h per day
    
    if (startDate && numberOfDays > 0) {
        const start = new Date(startDate);
        const end = new Date(start);
        end.setDate(start.getDate() + Math.ceil(numberOfDays) - 1);
        endInput.value = end.toISOString().split('T')[0];
    }
}

function filterLeaves() {
    const statusFilter = document.getElementById('status-filter').value;
    const searchTerm = document.getElementById('search-leaves').value.toLowerCase();
    
    // This would typically filter the leaves data
    // For now, we'll just reload the leaves
    loadUserLeaves();
}

async function markAsRead(notificationId) {
    try {
        const response = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            loadNotifications();
        }
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

async function markAllAsRead() {
    try {
        const response = await fetch(`${API_BASE}/notifications/mark-all-read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            loadNotifications();
            showAlert('All notifications marked as read', 'success');
        }
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        showAlert('Failed to mark notifications as read', 'error');
    }
}

async function handlePasswordChange(e) {
    e.preventDefault();
    console.log('Password change form submitted');
    
    // Implementation for password change
    showAlert('Password change functionality not implemented yet', 'info');
}

// Leave Balance Management Functions
async function loadFinancialYearInfo() {
    try {
        const response = await fetch(`${API_BASE}/admin/financial-year-info`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            document.getElementById('current-fy').textContent = `${data.currentYear}-${data.currentYear + 1}`;
            document.getElementById('fy-start').textContent = new Date(data.startDate).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
            document.getElementById('fy-end').textContent = new Date(data.endDate).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
        }
    } catch (error) {
        console.error('Error loading financial year info:', error);
    }
}

async function loadEmployees() {
    try {
        showSectionLoading('employee-list');
        
        const response = await fetch(`${API_BASE}/admin/employees/leave-balances`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const employees = await response.json();
            displayEmployees(employees);
        } else {
            showAlert('Failed to load employees', 'error');
        }
    } catch (error) {
        console.error('Error loading employees:', error);
        showAlert('Error loading employees', 'error');
    } finally {
        hideLoading('employee-list');
    }
}

function displayEmployees(employees) {
    const container = document.getElementById('employee-list');
    
    if (employees.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #718096;">No employees found.</p>';
        return;
    }

    container.innerHTML = employees.map(employee => {
        const balances = employee.leaveBalances || [];
        const balanceItems = balances.map(balance => {
            const leaveType = balance.leaveType;
            return `
                <div class="balance-item" style="--leave-color: ${leaveType.color || '#4299e1'}">
                    <h6>${leaveType.name}</h6>
                    <div class="balance-stats">
                        <div class="balance-stat">
                            <span class="label">Total:</span>
                            <span class="value">${balance.totalDays}</span>
                        </div>
                        <div class="balance-stat">
                            <span class="label">Used:</span>
                            <span class="value">${balance.usedDays}</span>
                        </div>
                        <div class="balance-stat">
                            <span class="label">Remaining:</span>
                            <span class="value">${balance.remainingDays}</span>
                        </div>
                        <div class="balance-stat">
                            <span class="label">Carried Over:</span>
                            <span class="value">${balance.carriedOverDays}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="employee-card">
                <div class="employee-header">
                    <div class="employee-info">
                        <h5>${employee.firstName} ${employee.lastName}</h5>
                        <p>${employee.employeeId} • ${employee.department} • ${employee.position}</p>
                    </div>
                    <button class="edit-balance-btn" onclick="editEmployeeBalance(${employee.id})">
                        <i class="fas fa-edit"></i> Edit Balance
                    </button>
                </div>
                <div class="leave-balances">
                    ${balanceItems}
                </div>
            </div>
        `;
    }).join('');
}

async function editEmployeeBalance(userId) {
    try {
        const response = await fetch(`${API_BASE}/admin/employees/${userId}/leave-balance`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            showEditBalanceModal(data);
        } else {
            showAlert('Failed to load employee balance', 'error');
        }
    } catch (error) {
        console.error('Error loading employee balance:', error);
        showAlert('Error loading employee balance', 'error');
    }
}

function showEditBalanceModal(data) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Edit Leave Balance - ${data.employee.firstName} ${data.employee.lastName}</h3>
                <button class="close-modal" onclick="closeModal(this)">&times;</button>
            </div>
            <div class="modal-body">
                <div class="balance-forms">
                    ${data.balances.map(balance => `
                        <div class="balance-form" data-balance-id="${balance.id}">
                            <h4>${balance.leaveType.name}</h4>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Total Days</label>
                                    <input type="number" step="0.5" min="0" value="${balance.totalDays}" class="total-days">
                                </div>
                                <div class="form-group">
                                    <label>Used Days</label>
                                    <input type="number" step="0.5" min="0" value="${balance.usedDays}" class="used-days">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Carried Over Days</label>
                                    <input type="number" step="0.5" min="0" value="${balance.carriedOverDays}" class="carried-over-days">
                                </div>
                                <div class="form-group">
                                    <label>Max Carry Over</label>
                                    <input type="number" step="0.5" min="0" value="${balance.maxCarryOver}" class="max-carry-over">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Notes</label>
                                <textarea class="balance-notes" rows="3">${balance.notes || ''}</textarea>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal(this)">Cancel</button>
                <button class="btn btn-primary" onclick="saveEmployeeBalance(${data.employee.id})">Save Changes</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function saveEmployeeBalance(userId) {
    try {
        const modal = document.querySelector('.modal.active');
        const balanceForms = modal.querySelectorAll('.balance-form');
        
        const updates = [];
        
        balanceForms.forEach(form => {
            const balanceId = form.dataset.balanceId;
            const totalDays = parseFloat(form.querySelector('.total-days').value);
            const usedDays = parseFloat(form.querySelector('.used-days').value);
            const carriedOverDays = parseFloat(form.querySelector('.carried-over-days').value);
            const maxCarryOver = parseFloat(form.querySelector('.max-carry-over').value);
            const notes = form.querySelector('.balance-notes').value;
            
            updates.push({
                balanceId,
                totalDays,
                usedDays,
                carriedOverDays,
                maxCarryOver,
                notes
            });
        });
        
        // Save each balance update
        for (const update of updates) {
            const response = await fetch(`${API_BASE}/admin/employees/${userId}/leave-balance`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(update)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to update balance ${update.balanceId}`);
            }
        }
        
        showAlert('Leave balance updated successfully', 'success');
        closeModal(document.querySelector('.modal.active'));
        loadEmployees(); // Refresh the list
        
    } catch (error) {
        console.error('Error saving employee balance:', error);
        showAlert('Error updating leave balance', 'error');
    }
}

async function processFinancialYearRollover() {
    try {
        const newYear = document.getElementById('new-fy-year').value;
        
        if (!newYear || newYear < 2020 || newYear > 2030) {
            showAlert('Please enter a valid year between 2020 and 2030', 'error');
            return;
        }
        
        const confirmed = confirm(`Are you sure you want to process the financial year rollover for FY ${newYear}-${newYear + 1}? This will apply the default leave balance to all employees and carry forward remaining annual leave.`);
        
        if (!confirmed) return;
        
        showSectionLoading('process-rollover');
        
        const response = await fetch(`${API_BASE}/admin/financial-year-rollover`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ newYear: parseInt(newYear) })
        });
        
        if (response.ok) {
            const result = await response.json();
            showAlert(`Financial year rollover completed successfully! ${result.processedCount} employees processed.`, 'success');
            // Refresh the employee list to show updated balances
            loadEmployees();
        } else {
            const error = await response.json();
            showAlert(error.message || 'Failed to process financial year rollover', 'error');
        }
    } catch (error) {
        console.error('Error processing financial year rollover:', error);
        showAlert('Error processing financial year rollover', 'error');
    } finally {
        hideLoading('process-rollover');
    }
}

function closeModal(element) {
    const modal = element.closest('.modal');
    if (modal) {
        modal.remove();
    }
}

// Add event listeners for leave balance management
document.addEventListener('click', function(e) {
    if (e.target.matches('[data-action="load-employees"]')) {
        loadEmployees();
    }
    
    if (e.target.matches('[data-action="process-rollover"]')) {
        processFinancialYearRollover();
    }
    
    if (e.target.matches('[data-action="save-default-balance"]')) {
        saveDefaultBalance();
    }
});

// Load financial year info when leave balance tab is shown
function loadLeaveBalanceData() {
    loadFinancialYearInfo();
    loadEmployees();
    loadDefaultBalance();
}

// Save default leave balance settings
async function saveDefaultBalance() {
    console.log('Saving default balance...');
    showAlert('Default balance save functionality not implemented yet', 'info');
}

// Load default balance settings
async function loadDefaultBalance() {
    try {
        const response = await fetch(`${API_BASE}/admin/default-balance`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('default-annual-leave').value = data.annualLeave || 20;
            document.getElementById('default-sick-leave').value = data.sickLeave || 10;
            document.getElementById('default-personal-leave').value = data.personalLeave || 5;
            document.getElementById('default-max-carryover').value = data.maxCarryOver || 5;
        }
    } catch (error) {
        console.error('Error loading default balance:', error);
    }
}

// Calculate hours based on number of days
function calculateHours() {
    const leaveHoursInput = document.getElementById('leave-hours');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    if (!leaveHoursInput || !startDateInput || !endDateInput) return;

    const startVal = startDateInput.value;
    const endVal = endDateInput.value;
    if (!startVal || !endVal) return;

    const start = new Date(startVal);
    const end = new Date(endVal);
    if (isNaN(start) || isNaN(end) || end < start) return;

    // Calculate inclusive days between dates
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((end - start) / msPerDay) + 1;
    const hours = diffDays * 8;
    leaveHoursInput.value = hours.toFixed(1);
}

// Add attachment to leave request
function addAttachment() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    input.accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png';
    
    input.onchange = function(e) {
        const files = Array.from(e.target.files);
        selectedFiles = selectedFiles.concat(files);
        displaySelectedFiles();
    };
    
    input.click();
}

// Display selected files
function displaySelectedFiles() {
    const container = document.getElementById('attachments-container');
    
    if (!container) {
        const newContainer = document.createElement('div');
        newContainer.id = 'attachments-container';
        newContainer.className = 'attachments-container';
        document.getElementById('leave-form').appendChild(newContainer);
    }
    
    const attachmentsContainer = document.getElementById('attachments-container');
    
    if (selectedFiles.length === 0) {
        attachmentsContainer.innerHTML = '';
        return;
    }
    
    attachmentsContainer.innerHTML = selectedFiles.map((file, index) => `
        <div class="attachment-item">
            <span>${file.name} (${(file.size / 1024).toFixed(1)} KB)</span>
            <button type="button" onclick="removeAttachment(${index})" class="remove-attachment">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// Remove attachment
function removeAttachment(index) {
    selectedFiles.splice(index, 1);
    displaySelectedFiles();
}

// Load user's leave balance data for overview page
async function loadUserLeaveBalance() {
    try {
        const response = await fetch(`${API_BASE}/users/leave-balance`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const balanceData = await response.json();
            displayUserLeaveBalance(balanceData);
        } else {
            console.error('Failed to load leave balance data');
        }
    } catch (error) {
        console.error('Error loading leave balance:', error);
    }
}

// Display user's leave balance on overview page
function displayUserLeaveBalance(balanceData) {
    // Update welcome section
    const userName = document.getElementById('user-name');
    const userEmployeeId = document.getElementById('user-employee-id-display');
    const currentFy = document.getElementById('current-fy');
    
    if (userName && currentUser) {
        userName.textContent = `${currentUser.firstName} ${currentUser.lastName}` || 'Employee';
    }
    
    if (userEmployeeId && currentUser) {
        userEmployeeId.textContent = currentUser.employeeId || 'N/A';
    }
    
    if (currentFy) {
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        currentFy.textContent = `${currentYear}-${nextYear}`;
    }

    // Update leave balance cards
    if (balanceData && balanceData.balances) {
        balanceData.balances.forEach(balance => {
            const leaveType = balance.LeaveType.name.toLowerCase();
            
            // Update entitlement
            const entitlementElement = document.getElementById(`${leaveType}-entitlement`);
            if (entitlementElement) {
                entitlementElement.textContent = `${balance.totalDays} days`;
            }
            
            // Update used days
            const usedElement = document.getElementById(`${leaveType}-used`);
            if (usedElement) {
                const usedDays = balance.totalDays - balance.remainingDays;
                usedElement.textContent = `${usedDays.toFixed(1)} days`;
            }
            
            // Update remaining days
            const remainingElement = document.getElementById(`${leaveType}-remaining`);
            if (remainingElement) {
                remainingElement.textContent = `${balance.remainingDays} days`;
            }
        });
    }
    
    // Update recent activity
    updateRecentActivity();
}

// Update recent activity section
function updateRecentActivity() {
    const activityList = document.getElementById('recent-activity-list');
    if (!activityList) return;
    
    // For now, show a simple message. In a real application, this would show actual recent activities
    activityList.innerHTML = `
        <div class="activity-item">
            <i class="fas fa-info-circle"></i>
            <span>Welcome to Datec Leave Management System</span>
        </div>
        <div class="activity-item">
            <i class="fas fa-calendar-check"></i>
            <span>Your leave balance has been updated for the current financial year</span>
        </div>
        <div class="activity-item">
            <i class="fas fa-clock"></i>
            <span>Last login: ${new Date().toLocaleDateString()}</span>
        </div>
    `;
}

// Test function to manually trigger leave request
function testLeaveRequest() {
    console.log('Testing leave request manually');
    const event = { preventDefault: () => {} };
    handleLeaveRequest(event);
}

// Audit Logs Functions
let realtimeInterval = null;
let lastAuditId = 0;

// Global variables for pagination
let currentAuditPage = 1;
let auditLogsPerPage = 20;
let totalAuditLogs = 0;
let allAuditLogs = [];

async function loadAuditLogs(page = 1) {
    try {
        console.log('🔍 Loading audit logs for page:', page);
        console.log('Auth token exists:', !!authToken);
        console.log('Auth token length:', authToken ? authToken.length : 0);
        
        const filters = {
            userId: document.getElementById('audit-user-filter').value || null,
            action: document.getElementById('audit-action-filter').value || null,
            category: document.getElementById('audit-category-filter').value || null,
            severity: document.getElementById('audit-severity-filter').value || null,
            search: document.getElementById('audit-search').value || null,
            sortBy: document.getElementById('audit-sort-by').value || 'createdAt',
            sortOrder: document.getElementById('audit-sort-order').value || 'desc',
            startDate: document.getElementById('audit-start-date').value || null,
            endDate: document.getElementById('audit-end-date').value || null,
            limit: 1000, // Get all logs for pagination
            offset: 0
        };

        console.log('📋 Filters:', filters);

        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) queryParams.append(key, value);
        });

        const url = `${API_BASE}/audit/logs?${queryParams}`;
        console.log('🌐 Requesting URL:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);

        if (response.ok) {
            const data = await response.json();
            console.log('📊 Audit logs data:', data);
            
            // Store all logs and update pagination
            allAuditLogs = data.data;
            totalAuditLogs = data.data.length;
            currentAuditPage = page;
            
            // Get logs for current page
            const startIndex = (page - 1) * auditLogsPerPage;
            const endIndex = startIndex + auditLogsPerPage;
            const pageLogs = allAuditLogs.slice(startIndex, endIndex);
            
            displayAuditLogs(pageLogs);
            updateAuditStats(allAuditLogs); // Use all logs for stats
            updateAuditCount(totalAuditLogs);
            displayAuditPagination();
            
            // Update last audit ID for real-time monitoring
            if (data.data.length > 0) {
                lastAuditId = Math.max(...data.data.map(log => log.id));
            }
        } else {
            const errorData = await response.text();
            console.error('❌ Failed to load audit logs:', errorData);
            showAlert('Failed to load audit logs', 'error');
        }
    } catch (error) {
        console.error('❌ Error loading audit logs:', error);
        showAlert('Error loading audit logs', 'error');
    }
}

function displayAuditLogs(auditLogs) {
    console.log('🎨 Displaying audit logs:', auditLogs);
    
    const tbody = document.getElementById('audit-logs-tbody');
    if (!tbody) {
        console.error('❌ Audit logs tbody not found');
        return;
    }

    console.log('📋 Found tbody element:', tbody);

    if (auditLogs.length === 0) {
        console.log('📭 No audit logs to display');
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #718096; padding: 40px;">No audit logs found</td></tr>';
        return;
    }

    console.log('📊 Rendering', auditLogs.length, 'audit logs');

    tbody.innerHTML = auditLogs.map(log => `
        <tr class="audit-row ${log.isSuccessful ? 'success' : 'error'}">
            <td>${new Date(log.createdAt).toLocaleString()}</td>
            <td>${log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}</td>
            <td><span class="badge badge-${getActionBadgeClass(log.action)}">${log.action}</span></td>
            <td>${log.entityType}${log.entityId ? ` (${log.entityId})` : ''}</td>
            <td><span class="badge badge-${getCategoryBadgeClass(log.category)}">${log.category}</span></td>
            <td><span class="badge badge-${getSeverityBadgeClass(log.severity)}">${log.severity}</span></td>
            <td><span class="badge badge-${log.isSuccessful ? 'success' : 'error'}">${log.isSuccessful ? 'Success' : 'Failed'}</span></td>
            <td>${log.ipAddress || 'N/A'}</td>
            <td>
                <button class="btn btn-sm btn-outline" onclick="console.log('Details button clicked for ID: ${log.id}'); showAuditDetails(${log.id})">
                    <i class="fas fa-eye"></i> Details
                </button>
                <button class="btn btn-sm btn-secondary" onclick="console.log('Export button clicked for ID: ${log.id}'); exportSingleAuditLog(${log.id})" style="margin-left: 5px;">
                    <i class="fas fa-download"></i> Export
                </button>
            </td>
        </tr>
    `).join('');
    
    console.log('✅ Audit logs displayed successfully');
}

function updateAuditStats(auditLogs) {
    const total = auditLogs.length;
    const successful = auditLogs.filter(log => log.isSuccessful).length;
    const failed = total - successful;
    const highSeverity = auditLogs.filter(log => log.severity === 'high' || log.severity === 'critical').length;

    document.getElementById('total-audit-events').textContent = total;
    document.getElementById('successful-audit-events').textContent = successful;
    document.getElementById('failed-audit-events').textContent = failed;
    document.getElementById('high-severity-events').textContent = highSeverity;
}

function updateAuditCount(count) {
    const countElement = document.getElementById('audit-count');
    if (countElement) {
        countElement.textContent = `${count} records`;
    }
}

function displayAuditPagination() {
    const paginationContainer = document.getElementById('audit-pagination');
    if (!paginationContainer) {
        console.error('❌ Pagination container not found');
        return;
    }

    const totalPages = Math.ceil(totalAuditLogs / auditLogsPerPage);
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let paginationHTML = '<div class="pagination-controls">';
    
    // Previous button
    if (currentAuditPage > 1) {
        paginationHTML += `<button class="btn btn-sm btn-outline" onclick="changeAuditPage(${currentAuditPage - 1})">
            <i class="fas fa-chevron-left"></i> Previous
        </button>`;
    }
    
    // Page numbers
    const startPage = Math.max(1, currentAuditPage - 2);
    const endPage = Math.min(totalPages, currentAuditPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        if (i === currentAuditPage) {
            paginationHTML += `<button class="btn btn-sm btn-primary" disabled>${i}</button>`;
        } else {
            paginationHTML += `<button class="btn btn-sm btn-outline" onclick="changeAuditPage(${i})">${i}</button>`;
        }
    }
    
    // Next button
    if (currentAuditPage < totalPages) {
        paginationHTML += `<button class="btn btn-sm btn-outline" onclick="changeAuditPage(${currentAuditPage + 1})">
            Next <i class="fas fa-chevron-right"></i>
        </button>`;
    }
    
    // Page info
    const startRecord = (currentAuditPage - 1) * auditLogsPerPage + 1;
    const endRecord = Math.min(currentAuditPage * auditLogsPerPage, totalAuditLogs);
    
    paginationHTML += `<span class="page-info">Showing ${startRecord}-${endRecord} of ${totalAuditLogs} records</span>`;
    paginationHTML += '</div>';
    
    paginationContainer.innerHTML = paginationHTML;
}

function changeAuditPage(page) {
    if (page >= 1 && page <= Math.ceil(totalAuditLogs / auditLogsPerPage)) {
        currentAuditPage = page;
        const startIndex = (page - 1) * auditLogsPerPage;
        const endIndex = startIndex + auditLogsPerPage;
        const pageLogs = allAuditLogs.slice(startIndex, endIndex);
        
        displayAuditLogs(pageLogs);
        displayAuditPagination();
        
        // Scroll to top of table
        const tableContainer = document.querySelector('.audit-logs-table');
        if (tableContainer) {
            tableContainer.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

// Make audit functions globally available
window.toggleRealtimeMonitoring = function() {
    const button = document.getElementById('realtime-toggle');
    const statusElement = document.getElementById('realtime-status');
    
    if (realtimeInterval) {
        // Stop real-time monitoring
        clearInterval(realtimeInterval);
        realtimeInterval = null;
        button.innerHTML = '<i class="fas fa-broadcast-tower"></i> Enable Real-time';
        button.classList.remove('realtime-active');
        statusElement.textContent = 'Inactive';
        statusElement.style.color = '#718096';
    } else {
        // Start real-time monitoring
        realtimeInterval = setInterval(checkRealtimeUpdates, 5000); // Check every 5 seconds
        button.innerHTML = '<i class="fas fa-stop"></i> Stop Real-time';
        button.classList.add('realtime-active');
        statusElement.textContent = 'Active';
        statusElement.style.color = '#48bb78';
    }
}

function toggleRealtimeMonitoring() {
    return window.toggleRealtimeMonitoring();
}

async function checkRealtimeUpdates() {
    try {
        const response = await fetch(`${API_BASE}/audit/realtime?lastId=${lastAuditId}&limit=10`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.hasNewData && data.data.length > 0) {
                // Add new logs to the top of the table
                const tbody = document.getElementById('audit-logs-tbody');
                const newRows = data.data.map(log => `
                    <tr class="audit-row ${log.isSuccessful ? 'success' : 'error'}" style="animation: fadeInNew 0.5s ease-in;">
                        <td>${new Date(log.createdAt).toLocaleString()}</td>
                        <td>${log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}</td>
                        <td><span class="badge badge-${getActionBadgeClass(log.action)}">${log.action}</span></td>
                        <td>${log.entityType}${log.entityId ? ` (${log.entityId})` : ''}</td>
                        <td><span class="badge badge-${getCategoryBadgeClass(log.category)}">${log.category}</span></td>
                        <td><span class="badge badge-${getSeverityBadgeClass(log.severity)}">${log.severity}</span></td>
                        <td><span class="badge badge-${log.isSuccessful ? 'success' : 'error'}">${log.isSuccessful ? 'Success' : 'Failed'}</span></td>
                        <td>${log.ipAddress || 'N/A'}</td>
                        <td>
                            <button class="btn btn-sm btn-outline" onclick="showAuditDetails(${log.id})">
                                <i class="fas fa-eye"></i> Details
                            </button>
                        </td>
                    </tr>
                `).join('');
                
                tbody.insertAdjacentHTML('afterbegin', newRows);
                
                // Update last audit ID
                lastAuditId = Math.max(...data.data.map(log => log.id));
                
                // Show notification
                showAlert(`${data.data.length} new audit log(s) received`, 'info');
            }
        }
    } catch (error) {
        console.error('Error checking real-time updates:', error);
    }
}

// Make audit functions globally available
window.loadSecurityAlerts = async function() {
    try {
        const response = await fetch(`${API_BASE}/audit/alerts`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displaySecurityAlerts(data.data);
        } else {
            showAlert('Failed to load security alerts', 'error');
        }
    } catch (error) {
        console.error('Error loading security alerts:', error);
        showAlert('Error loading security alerts', 'error');
    }
}

async function loadSecurityAlerts() {
    return window.loadSecurityAlerts();
}

function displaySecurityAlerts(alertsData) {
    const alertsContainer = document.getElementById('alerts-container');
    const alertsSection = document.getElementById('security-alerts');
    
    if (!alertsContainer || !alertsSection) return;

    alertsSection.style.display = 'block';
    
    const { alerts, anomalies } = alertsData;
    
    let alertsHTML = '';
    
    // Display security alerts
    if (alerts.length > 0) {
        alertsHTML += '<h5>Security Alerts</h5>';
        alerts.forEach(alert => {
            alertsHTML += `
                <div class="alert-item ${alert.severity}">
                    <div class="alert-header">
                        <span class="badge badge-${getSeverityBadgeClass(alert.severity)}">${alert.severity}</span>
                        <span class="alert-time">${new Date(alert.createdAt).toLocaleString()}</span>
                    </div>
                    <div class="alert-content">
                        <strong>${alert.action}</strong> - ${alert.description || 'No description'}
                    </div>
                    <div class="alert-details">
                        <small>User: ${alert.user ? `${alert.user.firstName} ${alert.user.lastName}` : 'System'}</small>
                        <small>IP: ${alert.ipAddress || 'N/A'}</small>
                    </div>
                </div>
            `;
        });
    }
    
    // Display anomalies
    if (anomalies.totalAnomalies > 0) {
        alertsHTML += '<h5>Anomalies Detected</h5>';
        
        if (anomalies.suspiciousActivity.length > 0) {
            alertsHTML += '<div class="anomaly-group"><strong>Suspicious Activity:</strong></div>';
            anomalies.suspiciousActivity.forEach(activity => {
                alertsHTML += `
                    <div class="alert-item warning">
                        <div class="alert-content">
                            User ${activity.userId} performed ${activity.action} ${activity.count} times from IP ${activity.ipAddress}
                        </div>
                    </div>
                `;
            });
        }
        
        if (anomalies.failedAuthAttempts.length > 0) {
            alertsHTML += '<div class="anomaly-group"><strong>Failed Authentication Attempts:</strong></div>';
            anomalies.failedAuthAttempts.forEach(auth => {
                alertsHTML += `
                    <div class="alert-item danger">
                        <div class="alert-content">
                            ${auth.count} failed login attempts from IP ${auth.ipAddress}
                        </div>
                    </div>
                `;
            });
        }
    }
    
    if (alertsHTML === '') {
        alertsHTML = '<p style="text-align: center; color: #718096;">No security alerts found</p>';
    }
    
    alertsContainer.innerHTML = alertsHTML;
}

// Make audit functions globally available
window.showAuditStats = async function() {
    try {
        const response = await fetch(`${API_BASE}/audit/stats?groupBy=day`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayAuditStats(data.data);
        } else {
            showAlert('Failed to load audit statistics', 'error');
        }
    } catch (error) {
        console.error('Error loading audit statistics:', error);
        showAlert('Error loading audit statistics', 'error');
    }
}

async function showAuditStats() {
    return window.showAuditStats();
}

function displayAuditStats(stats) {
    // Create a modal to display detailed statistics
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h3><i class="fas fa-chart-bar"></i> Audit Statistics</h3>
                <span class="close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
            </div>
            <div class="modal-body">
                <div class="stats-summary">
                    <h4>Summary</h4>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-value">${stats.summary.totalEvents}</span>
                            <span class="stat-label">Total Events</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${stats.summary.successfulEvents}</span>
                            <span class="stat-label">Successful</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${stats.summary.failedEvents}</span>
                            <span class="stat-label">Failed</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${stats.summary.highSeverityEvents}</span>
                            <span class="stat-label">High Severity</span>
                        </div>
                    </div>
                </div>
                <div class="stats-details">
                    <h4>Detailed Statistics</h4>
                    <div class="stats-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Severity</th>
                                    <th>Count</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stats.detailed.map(stat => `
                                    <tr>
                                        <td>${new Date(stat.dateGroup).toLocaleDateString()}</td>
                                        <td><span class="badge badge-${getCategoryBadgeClass(stat.category)}">${stat.category}</span></td>
                                        <td><span class="badge badge-${getSeverityBadgeClass(stat.severity)}">${stat.severity}</span></td>
                                        <td>${stat.count}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

// Make audit functions globally available
window.clearAuditFilters = function() {
    document.getElementById('audit-search').value = '';
    document.getElementById('audit-user-filter').value = '';
    document.getElementById('audit-action-filter').value = '';
    document.getElementById('audit-category-filter').value = '';
    document.getElementById('audit-severity-filter').value = '';
    document.getElementById('audit-sort-by').value = 'createdAt';
    document.getElementById('audit-sort-order').value = 'desc';
    document.getElementById('audit-start-date').value = '';
    document.getElementById('audit-end-date').value = '';
    
    loadAuditLogs(1);
}

window.refreshAuditLogs = function() {
    loadAuditLogs(1);
}

function clearAuditFilters() {
    return window.clearAuditFilters();
}

function refreshAuditLogs() {
    return window.refreshAuditLogs();
}

// Make functions globally available for onclick handlers
window.showAuditDetails = async function(auditId) {
    console.log('🔍 Show audit details function called for ID:', auditId);
    console.log('🔍 Function context:', this);
    console.log('🔍 Window object:', window);
    console.log('🔍 Auth token exists:', !!authToken);
    console.log('🔍 API_BASE:', API_BASE);
    
    try {
        showAlert('Loading audit details...', 'info');
        
        const response = await fetch(`${API_BASE}/audit/logs/${auditId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('📊 Audit details data:', data);
            showAuditDetailsModal(data.data);
        } else {
            const errorData = await response.text();
            console.error('❌ Failed to load audit details:', errorData);
            showAlert('Failed to load audit details', 'error');
        }
    } catch (error) {
        console.error('❌ Error loading audit details:', error);
        showAlert('Error loading audit details', 'error');
    }
};

function showAuditDetailsModal(auditLog) {
    // Remove existing modal if any
    const existingModal = document.getElementById('audit-details-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create modal HTML
    const modalHTML = `
        <div id="audit-details-modal" class="modal active">
            <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3><i class="fas fa-search"></i> Audit Log Details</h3>
                    <button class="close-modal" onclick="closeAuditDetailsModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="audit-details-grid">
                        <div class="detail-section">
                            <h4><i class="fas fa-info-circle"></i> Basic Information</h4>
                            <div class="detail-row">
                                <span class="detail-label">ID:</span>
                                <span class="detail-value">${auditLog.id}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Action:</span>
                                <span class="detail-value">
                                    <span class="badge badge-${getActionBadgeClass(auditLog.action)}">${auditLog.action}</span>
                                </span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Category:</span>
                                <span class="detail-value">
                                    <span class="badge badge-${getCategoryBadgeClass(auditLog.category)}">${auditLog.category}</span>
                                </span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Severity:</span>
                                <span class="detail-value">
                                    <span class="badge badge-${getSeverityBadgeClass(auditLog.severity)}">${auditLog.severity}</span>
                                </span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Status:</span>
                                <span class="detail-value">
                                    <span class="badge badge-${auditLog.isSuccessful ? 'success' : 'error'}">${auditLog.isSuccessful ? 'Success' : 'Failed'}</span>
                                </span>
                            </div>
                        </div>

                        <div class="detail-section">
                            <h4><i class="fas fa-user"></i> User Information</h4>
                            <div class="detail-row">
                                <span class="detail-label">User:</span>
                                <span class="detail-value">${auditLog.user ? `${auditLog.user.firstName} ${auditLog.user.lastName} (${auditLog.user.email})` : 'System'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">User ID:</span>
                                <span class="detail-value">${auditLog.userId || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">IP Address:</span>
                                <span class="detail-value">${auditLog.ipAddress || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">User Agent:</span>
                                <span class="detail-value">${auditLog.userAgent || 'N/A'}</span>
                            </div>
                        </div>

                        <div class="detail-section">
                            <h4><i class="fas fa-database"></i> Entity Information</h4>
                            <div class="detail-row">
                                <span class="detail-label">Entity Type:</span>
                                <span class="detail-value">${auditLog.entityType}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Entity ID:</span>
                                <span class="detail-value">${auditLog.entityId || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Session ID:</span>
                                <span class="detail-value">${auditLog.sessionId || 'N/A'}</span>
                            </div>
                        </div>

                        <div class="detail-section">
                            <h4><i class="fas fa-clock"></i> Timestamp</h4>
                            <div class="detail-row">
                                <span class="detail-label">Created:</span>
                                <span class="detail-value">${new Date(auditLog.createdAt).toLocaleString()}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Updated:</span>
                                <span class="detail-value">${auditLog.updatedAt ? new Date(auditLog.updatedAt).toLocaleString() : 'N/A'}</span>
                            </div>
                        </div>

                        ${auditLog.description ? `
                        <div class="detail-section">
                            <h4><i class="fas fa-file-text"></i> Description</h4>
                            <div class="detail-content">
                                <p>${auditLog.description}</p>
                            </div>
                        </div>
                        ` : ''}

                        ${auditLog.errorMessage ? `
                        <div class="detail-section">
                            <h4><i class="fas fa-exclamation-triangle"></i> Error Message</h4>
                            <div class="detail-content">
                                <p class="error-message">${auditLog.errorMessage}</p>
                            </div>
                        </div>
                        ` : ''}

                        ${auditLog.oldValues ? `
                        <div class="detail-section">
                            <h4><i class="fas fa-history"></i> Previous Values</h4>
                            <div class="detail-content">
                                <pre class="json-display">${JSON.stringify(auditLog.oldValues, null, 2)}</pre>
                            </div>
                        </div>
                        ` : ''}

                        ${auditLog.newValues ? `
                        <div class="detail-section">
                            <h4><i class="fas fa-plus-circle"></i> New Values</h4>
                            <div class="detail-content">
                                <pre class="json-display">${JSON.stringify(auditLog.newValues, null, 2)}</pre>
                            </div>
                        </div>
                        ` : ''}

                        ${auditLog.metadata ? `
                        <div class="detail-section">
                            <h4><i class="fas fa-cogs"></i> Metadata</h4>
                            <div class="detail-content">
                                <pre class="json-display">${JSON.stringify(auditLog.metadata, null, 2)}</pre>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeAuditDetailsModal()">
                        <i class="fas fa-times"></i> Close
                    </button>
                    <button class="btn btn-primary" onclick="exportSingleAuditLog(${auditLog.id})">
                        <i class="fas fa-download"></i> Export This Log
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeAuditDetailsModal() {
    const modal = document.getElementById('audit-details-modal');
    if (modal) {
        modal.remove();
    }
}

function getActionBadgeClass(action) {
    const actionClasses = {
        'login': 'primary',
        'logout': 'secondary',
        'create': 'success',
        'update': 'warning',
        'delete': 'danger',
        'read': 'info'
    };
    return actionClasses[action] || 'default';
}

function getCategoryBadgeClass(category) {
    const categoryClasses = {
        'authentication': 'primary',
        'authorization': 'warning',
        'data_access': 'info',
        'data_modification': 'success',
        'system': 'secondary',
        'security': 'danger'
    };
    return categoryClasses[category] || 'default';
}

function getSeverityBadgeClass(severity) {
    const severityClasses = {
        'low': 'success',
        'medium': 'warning',
        'high': 'danger',
        'critical': 'danger'
    };
    return severityClasses[severity] || 'default';
}

// Make functions globally available for onclick handlers
window.exportAuditLogs = async function() {
    console.log('🚀 Export audit logs function called');
    console.log('🔍 Function context:', this);
    console.log('🔍 Window object:', window);
    console.log('🔍 Auth token exists:', !!authToken);
    console.log('🔍 API_BASE:', API_BASE);
    
    // Show immediate feedback
    showAlert('Starting export process...', 'info');
    
    try {
        // Get current filters
        const filters = {
            startDate: document.getElementById('audit-start-date')?.value || null,
            endDate: document.getElementById('audit-end-date')?.value || null,
            category: document.getElementById('audit-category-filter')?.value || null,
            severity: document.getElementById('audit-severity-filter')?.value || null,
            userId: document.getElementById('audit-user-filter')?.value || null
        };

        console.log('📊 Current filters:', filters);

        // For now, directly export to Excel without modal
        const exportType = 'excel';
        console.log('📋 Export type selected:', exportType);

        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) queryParams.append(key, value);
        });

        // Use Excel endpoint
        const endpoint = '/audit/export-excel';
        const url = `${API_BASE}${endpoint}?${queryParams}`;
        console.log('🌐 Making request to:', url);

        showAlert('Making API request...', 'info');

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        console.log('📡 Response status:', response.status);
        console.log('📡 Response headers:', response.headers);

        if (response.ok) {
            console.log('✅ Export successful, processing blob...');
            showAlert('Processing response...', 'info');
            
            const blob = await response.blob();
            console.log('📦 Blob size:', blob.size, 'bytes');
            
            if (blob.size === 0) {
                showAlert('Warning: Export file is empty. This might indicate no data was found.', 'warning');
                return;
            }
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const timestamp = new Date().toISOString().split('T')[0];
            a.download = `audit_logs_${timestamp}.xlsx`;
            
            console.log('💾 Downloading file:', a.download);
            showAlert('Downloading file...', 'info');
            
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showAlert(`Audit logs exported to Excel successfully! File size: ${blob.size} bytes`, 'success');
            console.log('✅ Export completed successfully');
        } else {
            const errorText = await response.text();
            console.error('❌ Export failed with status:', response.status);
            console.error('❌ Error response:', errorText);
            showAlert(`Failed to export audit logs: ${response.status} - ${errorText}`, 'error');
        }
    } catch (error) {
        console.error('❌ Error exporting audit logs:', error);
        showAlert(`Error exporting audit logs: ${error.message}`, 'error');
    }
}

// exportAuditLogs function is already defined as window.exportAuditLogs

// Simple test function for export
window.testExportDirectly = async function() {
    console.log('🧪 Testing export directly...');
    showAlert('Testing export functionality...', 'info');
    
    try {
        const url = `${API_BASE}/audit/export-excel`;
        console.log('🌐 Testing URL:', url);
        
        showAlert('Making test API request...', 'info');
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        console.log('📡 Test response status:', response.status);
        
        if (response.ok) {
            showAlert('Processing test response...', 'info');
            const blob = await response.blob();
            console.log('📦 Test blob size:', blob.size, 'bytes');
            
            if (blob.size === 0) {
                showAlert('Warning: Test export file is empty!', 'warning');
                return;
            }
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `test_audit_logs_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showAlert(`Test export successful! File size: ${blob.size} bytes`, 'success');
        } else {
            const errorText = await response.text();
            console.error('❌ Test export failed:', errorText);
            showAlert(`Test export failed: ${response.status} - ${errorText}`, 'error');
        }
    } catch (error) {
        console.error('❌ Test export error:', error);
        showAlert(`Test export error: ${error.message}`, 'error');
    }
};

// Show export options modal
window.showExportOptionsModal = function() {
    console.log('📋 Show export options modal function called');
    return new Promise((resolve) => {
        // Create modal with proper styles
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;
        
        modal.innerHTML = `
            <div class="modal-content" style="
                background: white;
                padding: 20px;
                border-radius: 8px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                position: relative;
            ">
                <div class="modal-header" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 10px;
                ">
                    <h3 style="margin: 0;">Export Audit Logs</h3>
                    <span class="close" style="
                        cursor: pointer;
                        font-size: 24px;
                        font-weight: bold;
                        color: #999;
                    ">&times;</span>
                </div>
                <div class="modal-body">
                    <p>Choose export format:</p>
                    <div class="export-options" style="
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                        margin: 20px 0;
                    ">
                        <button class="btn btn-primary export-option" data-format="excel" style="
                            padding: 10px 20px;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            background-color: #007bff;
                            color: white;
                            text-align: left;
                        ">
                            <i class="fas fa-file-excel"></i> Excel (Multiple Worksheets)
                        </button>
                        <button class="btn btn-secondary export-option" data-format="csv" style="
                            padding: 10px 20px;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            background-color: #6c757d;
                            color: white;
                            text-align: left;
                        ">
                            <i class="fas fa-file-csv"></i> CSV
                        </button>
                        <button class="btn btn-info export-option" data-format="json" style="
                            padding: 10px 20px;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            background-color: #17a2b8;
                            color: white;
                            text-align: left;
                        ">
                            <i class="fas fa-file-code"></i> JSON
                        </button>
                    </div>
                    <div class="export-info" style="
                        background-color: #f8f9fa;
                        padding: 15px;
                        border-radius: 4px;
                        margin-top: 20px;
                    ">
                        <p style="margin: 0 0 10px 0;"><strong>Excel Export includes:</strong></p>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li>Summary worksheet with statistics</li>
                            <li>Separate worksheets for each category</li>
                            <li>Complete audit logs worksheet</li>
                            <li>Formatted and styled data</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelectorAll('.export-option').forEach(button => {
            button.addEventListener('click', () => {
                const format = button.dataset.format;
                modal.remove();
                resolve(format);
            });
        });

        // Close modal on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(null);
            }
        });

        // Close modal on X click
        modal.querySelector('.close').addEventListener('click', () => {
            modal.remove();
            resolve(null);
        });

        document.body.appendChild(modal);
    });
}

// Add event listeners for form submission
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM Content Loaded - Setting up event listeners');
    
    // Add event listener for leave form submission
    const leaveForm = document.getElementById('leave-form');
    if (leaveForm) {
        console.log('Leave form found, adding submit listener');
        leaveForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('Leave form submit event triggered');
            handleLeaveRequest(e);
        });
    } else {
        console.log('Leave form not found');
    }
    
    // Add click event listener for submit button as backup
    document.addEventListener('click', function(e) {
        if (e.target.matches('#leave-form button[type="submit"]')) {
            console.log('Submit button clicked directly');
            e.preventDefault();
            handleLeaveRequest(e);
        }
    });

    // Add event listeners for password reset functionality
    const resetAllPasswordsForm = document.getElementById('reset-all-passwords-form');
    if (resetAllPasswordsForm) {
        resetAllPasswordsForm.addEventListener('submit', handleResetAllPasswords);
    }

    // Add event listener for user search
    const searchUsersBtn = document.querySelector('[data-action="search-users"]');
    if (searchUsersBtn) {
        searchUsersBtn.addEventListener('click', handleSearchUsers);
    }

    // Add event listener for user search input (enter key)
    const userSearchInput = document.getElementById('user-search-input');
    if (userSearchInput) {
        userSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSearchUsers();
            }
        });
    }

    // Add global click event listener for debugging
    document.addEventListener('click', function(e) {
        console.log('🖱️ Click detected on:', e.target.tagName, e.target.className, e.target.id);
        if (e.target.matches('[onclick*="exportAuditLogs"]')) {
            console.log('📊 Export button clicked!');
        }
        if (e.target.matches('[onclick*="showAuditDetails"]')) {
            console.log('🔍 Details button clicked!');
        }
    });
});

// Handle reset all passwords
async function handleResetAllPasswords(e) {
    e.preventDefault();
    
    const newPassword = document.getElementById('new-password-all').value;
    const confirmPassword = document.getElementById('confirm-password-all').value;
    
    if (!newPassword || !confirmPassword) {
        showAlert('Please fill in all fields', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showAlert('Passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showAlert('Password must be at least 6 characters long', 'error');
        return;
    }

    // Show confirmation dialog
    const confirmed = await showPasswordResetConfirmation();
    if (!confirmed) {
        return;
    }

    try {
        showLoading('reset-all-passwords-form');
        
        const response = await fetch(`${API_BASE}/auth/reset-all-passwords`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                newPassword,
                confirmPassword
            })
        });

        const result = await response.json();
        hideLoading('reset-all-passwords-form');

        if (response.ok) {
            showAlert(`Successfully reset passwords for ${result.affectedUsers} employees`, 'success');
            document.getElementById('reset-all-passwords-form').reset();
        } else {
            showAlert(result.message || 'Failed to reset passwords', 'error');
        }
    } catch (error) {
        console.error('Error resetting passwords:', error);
        hideLoading('reset-all-passwords-form');
        showAlert('Error resetting passwords', 'error');
    }
}

// Handle user search
async function handleSearchUsers() {
    const searchTerm = document.getElementById('user-search-input').value.trim();
    
    if (!searchTerm) {
        showAlert('Please enter a search term', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users?search=${encodeURIComponent(searchTerm)}&limit=20`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            displayUserSearchResults(result.users);
        } else {
            showAlert(result.message || 'Failed to search users', 'error');
        }
    } catch (error) {
        console.error('Error searching users:', error);
        showAlert('Error searching users', 'error');
    }
}

// Display user search results
function displayUserSearchResults(users) {
    const userList = document.getElementById('user-list');
    
    if (!userList) {
        return;
    }
    
    if (!users || users.length === 0) {
        userList.innerHTML = '<div class="user-item"><p>No users found</p></div>';
        return;
    }

    userList.innerHTML = users.map(user => `
        <div class="user-item">
            <div class="user-info">
                <h5>${user.firstName} ${user.lastName}</h5>
                <p>${user.employeeId} • ${user.email} • ${user.department}</p>
            </div>
            <div class="user-actions">
                <button class="btn-reset-password" onclick="showIndividualPasswordReset(${user.id}, '${user.firstName} ${user.lastName}')">
                    <i class="fas fa-key"></i> Reset Password
                </button>
            </div>
        </div>
    `).join('');
}

// Show individual password reset modal
async function showIndividualPasswordReset(userId, userName) {
    const newPassword = await showPasswordResetModal(`Reset password for ${userName}`);
    
    if (!newPassword) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/reset-user-password/${userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                newPassword
            })
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(`Password reset successfully for ${userName}`, 'success');
        } else {
            showAlert(result.message || 'Failed to reset password', 'error');
        }
    } catch (error) {
        console.error('Error resetting user password:', error);
        showAlert('Error resetting password', 'error');
    }
}

// Show password reset confirmation dialog
function showPasswordResetConfirmation() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'password-reset-modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Confirm Password Reset</h3>
                    <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="confirmation-dialog">
                        <h5><i class="fas fa-exclamation-triangle"></i> Warning</h5>
                        <p>This action will reset passwords for ALL active employees (excluding yourself). 
                        All employees will need to use the new password to log in. This action cannot be undone.</p>
                    </div>
                    <p><strong>Are you sure you want to proceed?</strong></p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove(); arguments[0](false)">Cancel</button>
                    <button class="btn btn-warning" onclick="this.parentElement.parentElement.parentElement.remove(); arguments[0](true)">Confirm Reset</button>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                const confirmed = e.target.textContent.includes('Confirm');
                modal.remove();
                resolve(confirmed);
            });
        });

        // Close modal on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        });

        document.body.appendChild(modal);
    });
}

// Show password reset modal for individual user
function showPasswordResetModal(userName) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'password-reset-modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Reset Password for ${userName}</h3>
                    <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="new-password-individual">New Password</label>
                        <input type="password" id="new-password-individual" placeholder="Enter new password" minlength="6">
                    </div>
                    <div class="form-group">
                        <label for="confirm-password-individual">Confirm Password</label>
                        <input type="password" id="confirm-password-individual" placeholder="Confirm new password" minlength="6">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove(); arguments[0](null)">Cancel</button>
                    <button class="btn btn-warning" onclick="handleIndividualPasswordSubmit(this)">Reset Password</button>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('.btn-secondary').addEventListener('click', () => {
            modal.remove();
            resolve(null);
        });

        // Close modal on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(null);
            }
        });

        // Handle form submission
        window.handleIndividualPasswordSubmit = function(button) {
            const newPassword = document.getElementById('new-password-individual').value;
            const confirmPassword = document.getElementById('confirm-password-individual').value;
            
            if (!newPassword || !confirmPassword) {
                showAlert('Please fill in all fields', 'error');
                return;
            }
            
            if (newPassword !== confirmPassword) {
                showAlert('Passwords do not match', 'error');
                return;
            }
            
            if (newPassword.length < 6) {
                showAlert('Password must be at least 6 characters long', 'error');
                return;
            }

            modal.remove();
            resolve(newPassword);
        };

        document.body.appendChild(modal);
    });
} 

// Export single audit log entry
window.exportSingleAuditLog = async function(auditId) {
    console.log('🚀 Export single audit log function called for ID:', auditId);
    console.log('🔍 Function context:', this);
    console.log('🔍 Window object:', window);
    console.log('🔍 Auth token exists:', !!authToken);
    console.log('🔍 API_BASE:', API_BASE);
    
    // Show immediate feedback
    showAlert('Starting single audit log export...', 'info');
    
    try {
        // Create a filter for just this specific audit log
        const filters = {
            auditId: auditId
        };

        console.log('📊 Single audit log filters:', filters);
        
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value) queryParams.append(key, value);
        });

        // Use Excel endpoint with single audit log filter
        const endpoint = '/audit/export-excel';
        const url = `${API_BASE}${endpoint}?${queryParams}`;
        console.log('🌐 Making request to:', url);

        showAlert('Making API request for single audit log...', 'info');

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        console.log('📡 Response status:', response.status);
        console.log('📡 Response headers:', response.headers);

        if (response.ok) {
            console.log('✅ Single audit log export successful, processing blob...');
            showAlert('Processing single audit log response...', 'info');
            
            const blob = await response.blob();
            console.log('📦 Blob size:', blob.size, 'bytes');
            
            if (blob.size === 0) {
                showAlert('Warning: Single audit log export file is empty. This might indicate no data was found.', 'warning');
                return;
            }
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const timestamp = new Date().toISOString().split('T')[0];
            a.download = `audit_log_${auditId}_${timestamp}.xlsx`;
            
            console.log('💾 Downloading single audit log file:', a.download);
            showAlert('Downloading single audit log file...', 'info');
            
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showAlert(`Single audit log exported to Excel successfully! File size: ${blob.size} bytes`, 'success');
            console.log('✅ Single audit log export completed successfully');
        } else {
            const errorText = await response.text();
            console.error('❌ Single audit log export failed with status:', response.status);
            console.error('❌ Error response:', errorText);
            showAlert(`Failed to export single audit log: ${response.status} - ${errorText}`, 'error');
        }
    } catch (error) {
        console.error('❌ Error exporting single audit log:', error);
        showAlert(`Error exporting single audit log: ${error.message}`, 'error');
    }
};

// Make all audit functions globally available for onclick handlers
window.showAuditStats = showAuditStats;
window.toggleRealtimeMonitoring = toggleRealtimeMonitoring;
window.clearAuditFilters = clearAuditFilters;
window.refreshAuditLogs = refreshAuditLogs;
window.loadSecurityAlerts = loadSecurityAlerts;
window.exportAuditLogs = window.exportAuditLogs; // Already defined as window.exportAuditLogs
window.showAuditDetails = window.showAuditDetails; // Already defined as window.showAuditDetails
window.showAlert = showAlert; // Make showAlert globally available
window.testExportDirectly = window.testExportDirectly; // Test function for export debugging
window.exportSingleAuditLog = window.exportSingleAuditLog; // Single audit log export function
window.displayAuditPagination = displayAuditPagination; // Pagination display function
window.changeAuditPage = changeAuditPage; // Pagination page change function
window.closeAuditDetailsModal = closeAuditDetailsModal; // Close audit details modal function

// Leave Approval Functions
let pendingApprovals = [];
let approvalStats = { pending: 0, approved: 0, rejected: 0 };

// Load pending leave approvals for managers
async function loadLeaveApprovals() {
    try {
        showSectionLoading('approvals-list');
        
        const response = await fetch(`${API_BASE}/leaves/pending/approvals`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            pendingApprovals = data.leaves || [];
            updateApprovalStats();
            displayLeaveApprovals(pendingApprovals);
        } else {
            const error = await response.json();
            showAlert(error.message || 'Failed to load leave approvals', 'error');
        }
    } catch (error) {
        console.error('Error loading leave approvals:', error);
        showAlert('Network error while loading leave approvals', 'error');
    } finally {
        hideLoading('approvals-list');
    }
}

// Update approval statistics
function updateApprovalStats() {
    const today = new Date().toISOString().split('T')[0];
    
    approvalStats.pending = pendingApprovals.filter(leave => leave.status === 'pending').length;
    approvalStats.approved = pendingApprovals.filter(leave => 
        leave.status === 'approved' && 
        leave.approvedAt && 
        leave.approvedAt.startsWith(today)
    ).length;
    approvalStats.rejected = pendingApprovals.filter(leave => 
        leave.status === 'rejected' && 
        leave.approvedAt && 
        leave.approvedAt.startsWith(today)
    ).length;

    // Update UI
    document.getElementById('pending-count').textContent = approvalStats.pending;
    document.getElementById('approved-count').textContent = approvalStats.approved;
    document.getElementById('rejected-count').textContent = approvalStats.rejected;
}

// Display leave approvals in the UI
function displayLeaveApprovals(approvals) {
    const container = document.getElementById('approvals-list');
    
    if (!approvals || approvals.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <i class="fas fa-inbox"></i>
                <p>No leave approval requests found</p>
            </div>
        `;
        return;
    }

    container.innerHTML = approvals.map(leave => `
        <div class="approval-item" data-leave-id="${leave.id}">
            <div class="approval-header">
                <div class="approval-employee">
                    <div class="employee-avatar">
                        ${leave.User.firstName.charAt(0)}${leave.User.lastName.charAt(0)}
                    </div>
                    <div class="employee-info">
                        <h4>${leave.User.firstName} ${leave.User.lastName}</h4>
                        <p>${leave.User.department} • ${leave.User.position}</p>
                    </div>
                </div>
                <span class="approval-status ${leave.status}">${leave.status}</span>
            </div>
            
            <div class="approval-details">
                <div class="detail-group">
                    <label>Leave Type</label>
                    <span style="color: ${leave.leaveType.color}">${leave.leaveType.name}</span>
                </div>
                <div class="detail-group">
                    <label>Duration</label>
                    <span>${leave.numberOfDays} days (${leave.startDate} to ${leave.endDate})</span>
                </div>
                <div class="detail-group">
                    <label>Reason</label>
                    <span>${leave.reason}</span>
                </div>
                <div class="detail-group">
                    <label>Submitted</label>
                    <span>${new Date(leave.createdAt).toLocaleDateString()}</span>
                </div>
            </div>
            
            <div class="approval-actions">
                ${leave.status === 'pending' ? `
                    <button class="btn btn-approve" onclick="approveLeave(${leave.id})">
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn btn-reject" onclick="rejectLeave(${leave.id})">
                        <i class="fas fa-times"></i> Reject
                    </button>
                ` : ''}
                <button class="btn btn-view" onclick="viewLeaveDetails(${leave.id})">
                    <i class="fas fa-eye"></i> View Details
                </button>
            </div>
        </div>
    `).join('');
}

// Approve a leave request
async function approveLeave(leaveId) {
    try {
        // If manager provided notes in modal, include them
        const managerNotesEl = document.getElementById('manager-notes');
        const payload = { action: 'approve' };
        if (managerNotesEl && managerNotesEl.value && managerNotesEl.value.trim().length) {
            payload.managerNotes = managerNotesEl.value.trim();
        }

        const response = await apiFetch(`/leaves/${leaveId}/approve`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showAlert('Leave request approved successfully', 'success');
            // Close any open leave modal
            document.querySelectorAll('.modal').forEach(m => m.remove());
            await loadLeaveApprovals(); // Refresh the list
        } else {
            const error = await response.json();
            showAlert(error.message || 'Failed to approve leave request', 'error');
        }
    } catch (error) {
        console.error('Error approving leave:', error);
        showAlert('Network error while approving leave request', 'error');
    }
}

// Reject a leave request
async function rejectLeave(leaveId) {
    const rejectionReason = await showRejectionReasonModal();
    
    if (!rejectionReason) return; // User cancelled
    
    try {
        // include optional manager notes if present
        const managerNotesEl = document.getElementById('manager-notes');
        const payload = { action: 'reject', rejectionReason };
        if (managerNotesEl && managerNotesEl.value && managerNotesEl.value.trim().length) {
            payload.managerNotes = managerNotesEl.value.trim();
        }

        const response = await apiFetch(`/leaves/${leaveId}/approve`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showAlert('Leave request rejected successfully', 'success');
            // Close modal and refresh
            document.querySelectorAll('.modal').forEach(m => m.remove());
            await loadLeaveApprovals(); // Refresh the list
        } else {
            const error = await response.json();
            showAlert(error.message || 'Failed to reject leave request', 'error');
        }
    } catch (error) {
        console.error('Error rejecting leave:', error);
        showAlert('Network error while rejecting leave request', 'error');
    }
}

// Show rejection reason modal
function showRejectionReasonModal() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'rejection-reason-modal';
        modal.innerHTML = `
            <div class="rejection-reason-content">
                <h3>Provide Rejection Reason</h3>
                <textarea id="rejection-reason" placeholder="Please provide a reason for rejecting this leave request..."></textarea>
                <div class="rejection-reason-actions">
                    <button class="btn btn-secondary" onclick="this.closest('.rejection-reason-modal').remove(); resolve(null);">
                        Cancel
                    </button>
                    <button class="btn btn-reject" onclick="submitRejectionReason(this)">
                        Reject Leave
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('.btn-reject').addEventListener('click', function() {
            const reason = document.getElementById('rejection-reason').value.trim();
            if (reason.length < 5) {
                showAlert('Please provide a reason (minimum 5 characters)', 'error');
                return;
            }
            modal.remove();
            resolve(reason);
        });

        // Close modal on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(null);
            }
        });

        document.body.appendChild(modal);
        document.getElementById('rejection-reason').focus();
    });
}

// View leave details
async function viewLeaveDetails(leaveId) {
    try {
        const response = await apiFetch(`/leaves/${leaveId}`);

        if (response.ok) {
            const data = await response.json();
            showLeaveDetailsModal(data.leave);
        } else {
            const error = await response.json();
            showAlert(error.message || 'Failed to load leave details', 'error');
        }
    } catch (error) {
        console.error('Error loading leave details:', error);
        showAlert('Network error while loading leave details', 'error');
    }
}

// Show leave details modal
function showLeaveDetailsModal(leave) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Leave Request Details</h3>
                <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="leave-details">
                    <div class="detail-row">
                        <span class="detail-label">Employee:</span>
                        <span class="detail-value">${leave.User.firstName} ${leave.User.lastName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Department:</span>
                        <span class="detail-value">${leave.User.department}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Leave Type:</span>
                        <span class="detail-value">${leave.leaveType.name}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Duration:</span>
                        <span class="detail-value">${leave.numberOfDays} days</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Dates:</span>
                        <span class="detail-value">${leave.startDate} to ${leave.endDate}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Reason:</span>
                        <span class="detail-value">${leave.reason}</span>
                    </div>
                    ${leave.comments ? `
                        <div class="detail-row">
                            <span class="detail-label">Comments:</span>
                            <span class="detail-value">${leave.comments}</span>
                        </div>
                    ` : ''}
                    <div class="detail-row">
                        <span class="detail-label">Status:</span>
                        <span class="detail-value">${leave.status}</span>
                    </div>
                    ${leave.rejectionReason ? `
                        <div class="detail-row">
                            <span class="detail-label">Rejection Reason:</span>
                            <span class="detail-value">${leave.rejectionReason}</span>
                        </div>
                    ` : ''}
                    ${ (currentUser && ['manager','hr','admin'].includes(currentUser.role) && leave.status === 'pending') ? `
                        <div class="detail-row">
                            <div class="manager-action-form" style="margin-top:1rem;">
                                <label for="manager-notes">Manager Notes (optional)</label>
                                <textarea id="manager-notes" rows="3" placeholder="Add notes for the employee or record..." style="width:100%;"></textarea>
                                <div style="margin-top:0.5rem; display:flex; gap:8px;">
                                    <button class="btn btn-approve" onclick="approveLeave(${leave.id})"><i class="fas fa-check"></i> Approve</button>
                                    <button class="btn btn-reject" onclick="rejectLeave(${leave.id})"><i class="fas fa-times"></i> Reject</button>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    // Close modal on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    document.body.appendChild(modal);
}

// Filter approvals by status
function filterApprovals() {
    const statusFilter = document.getElementById('approval-status-filter').value;
    const searchTerm = document.getElementById('search-approvals').value.toLowerCase();
    
    let filteredApprovals = pendingApprovals;
    
    if (statusFilter) {
        filteredApprovals = filteredApprovals.filter(leave => leave.status === statusFilter);
    }
    
    if (searchTerm) {
        filteredApprovals = filteredApprovals.filter(leave => 
            leave.User.firstName.toLowerCase().includes(searchTerm) ||
            leave.User.lastName.toLowerCase().includes(searchTerm) ||
            leave.User.department.toLowerCase().includes(searchTerm)
        );
    }
    
    displayLeaveApprovals(filteredApprovals);
}

// Make leave approval functions globally available
window.loadLeaveApprovals = loadLeaveApprovals;
window.approveLeave = approveLeave;
window.rejectLeave = rejectLeave;
window.viewLeaveDetails = viewLeaveDetails;
window.filterApprovals = filterApprovals;

// Missing functions that are referenced
async function loadUserLeaveBalances() {
    try {
        const response = await fetch(`${API_BASE}/leave-balances/my-balances`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            updateLeaveBalanceDisplay(data.balances);
        }
    } catch (error) {
        console.error('Error loading user leave balances:', error);
    }
}

function updateLeaveBalanceDisplay(balances) {
    // Update leave balance display in the overview tab
    balances.forEach(balance => {
        const leaveType = balance.leaveType.name.toLowerCase();
        if (leaveType === 'annual') {
            document.getElementById('annual-entitlement').textContent = `${balance.totalDays} days`;
            document.getElementById('annual-used').textContent = `${balance.usedDays} days`;
            document.getElementById('annual-remaining').textContent = `${balance.remainingDays} days`;
        } else if (leaveType === 'sick') {
            document.getElementById('sick-entitlement').textContent = `${balance.totalDays} days`;
            document.getElementById('sick-used').textContent = `${balance.usedDays} days`;
            document.getElementById('sick-remaining').textContent = `${balance.remainingDays} days`;
        }
    });
}

async function loadMyLeaves() {
    try {
        const response = await apiFetch('/leaves/my-leaves');

        if (response.ok) {
            const data = await response.json();
            displayMyLeaves(data.leaves);
        }
    } catch (error) {
        console.error('Error loading my leaves:', error);
    }
}

function displayMyLeaves(leaves) {
    const container = document.getElementById('leaves-list');
    
    if (!leaves || leaves.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #718096;">No leave applications found.</p>';
        return;
    }

    container.innerHTML = leaves.map(leave => `
        <div class="leave-item">
            <div class="leave-header">
                <h4>${leave.leaveType.name}</h4>
                <span class="leave-status ${leave.status}">${leave.status}</span>
            </div>
            <div class="leave-details">
                <p><strong>Duration:</strong> ${leave.numberOfDays} days (${leave.startDate} to ${leave.endDate})</p>
                <p><strong>Reason:</strong> ${leave.reason}</p>
                <p><strong>Submitted:</strong> ${new Date(leave.createdAt).toLocaleDateString()}</p>
            </div>
        </div>
    `).join('');
}

async function loadNotifications() {
    try {
        const response = await fetch(`${API_BASE}/notifications`, {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });

        if (response.ok) {
            const body = await response.json();
            const notifications = Array.isArray(body) ? body : (body.notifications || []);
            displayNotifications(notifications);
            updateNotificationCount(notifications.length);
        } else {
            displayNotifications([]);
            updateNotificationCount(0);
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        displayNotifications([]);
        updateNotificationCount(0);
    }
}

function displayNotifications(notifications) {
    const container = document.getElementById('notifications-list');
    const countElement = document.getElementById('notification-count');
    
    if (!container) return;
    
    // Ensure notifications is an array
    if (!Array.isArray(notifications)) {
        console.warn('Notifications is not an array:', notifications);
        notifications = [];
    }
    
    if (notifications.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #718096;">No notifications found.</p>';
        if (countElement) countElement.textContent = '0 notifications';
        return;
    }

    if (countElement) {
        const unreadCount = notifications.filter(n => !n.isRead).length;
        countElement.textContent = `${notifications.length} notifications (${unreadCount} unread)`;
    }

    container.innerHTML = notifications.map(notification => `
        <div class="notification-item ${notification.isRead ? '' : 'unread'}" data-notification-id="${notification.id}" data-related-type="${notification.relatedType || ''}" data-related-id="${notification.relatedId || ''}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h4 style="margin:0">${notification.title}</h4>
              ${notification.recipientRole ? `<small class="badge">${notification.recipientRole}</small>` : ''}
            </div>
            <p>${notification.message}</p>
            <small>${new Date(notification.createdAt).toLocaleString()}</small>
        </div>
    `).join('');
}

async function markAsRead(notificationId) {
    try {
        const response = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });

        if (response.ok) {
            // Update UI to show notification as read
            const notificationItem = document.querySelector(`[data-notification-id="${notificationId}"]`);
            if (notificationItem) {
                notificationItem.classList.remove('unread');
                notificationItem.classList.add('read');
            }
        }
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

async function markAllAsRead() {
    try {
        const response = await fetch(`${API_BASE}/notifications/read-all`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });

        if (response.ok) {
            // Update UI to show all notifications as read
            document.querySelectorAll('.notification-item').forEach(item => {
                item.classList.remove('unread');
                item.classList.add('read');
            });
            updateNotificationCount(0);
        }
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
    }
}

async function loadAdminData() {
    // Load admin-specific data
    console.log('Loading admin data...');
}

async function loadLeaveBalances() {
    // Load leave balance management data
    console.log('Loading leave balances...');
}

async function loadAuditLogs() {
    // Load audit logs data
    console.log('Loading audit logs...');
}

function filterLeaves() {
    // Filter leaves based on status and search
    console.log('Filtering leaves...');
}

function showSectionLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '<div class="loading">Loading...</div>';
    }
}

function hideSectionLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        // Remove loading state - this will be handled by the specific functions
    }
}

function showAlert(message, type = 'info') {
    // Create and show alert message
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    document.body.appendChild(alert);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
    }, 5000);
}