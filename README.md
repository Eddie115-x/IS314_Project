# Datec Leave Management System

A comprehensive leave management system built with Node.js, Express, and Sequelize.

## Features

### Core Features
- **User Authentication**: Secure login with JWT tokens
- **Leave Management**: Apply, approve, and track leave requests
- **Leave Balance Tracking**: Automatic balance calculation and updates
- **Role-based Access Control**: Different permissions for employees, managers, HR, and admins
- **Audit Logging**: Comprehensive logging of all system activities
- **Notifications**: Real-time notifications for leave status updates

### Admin Features
- **Employee Registration**: Register new employees with automatic leave balance initialization
- **Leave Balance Management**: Manage leave balances for all employees
- **Financial Year Rollover**: Process end-of-year leave carryover
- **Audit Logs**: View and export comprehensive audit logs
- **Password Reset Management**: Reset passwords for all employees or individual users

## New Password Reset Functionality

### Admin Password Reset Features

The admin panel now includes a comprehensive password reset management system:

#### 1. Reset All Employee Passwords
- **Location**: Admin tab → Password Reset Management section
- **Functionality**: Reset passwords for all active employees (excluding the current admin)
- **Security**: Requires password confirmation and shows warning dialog
- **Audit**: All password reset actions are logged in the audit system

#### 2. Individual User Password Reset
- **Location**: Admin tab → Password Reset Management section
- **Functionality**: Search for specific users and reset their passwords individually
- **Search**: Search by Employee ID, Name, Email, or Department
- **Security**: Individual confirmation for each password reset

#### 3. Security Features
- **Password Validation**: Minimum 6 characters required
- **Confirmation Dialogs**: Clear warnings before bulk password resets
- **Audit Logging**: All password reset actions are tracked
- **Admin Exclusion**: Current admin is excluded from bulk password resets

### API Endpoints

#### Reset All Passwords
```
POST /api/auth/reset-all-passwords
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "newPassword": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

#### Reset Individual User Password
```
POST /api/auth/reset-user-password/:userId
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "newPassword": "newpassword123"
}
```

#### Search Users (Enhanced)
```
GET /api/users?search=john&limit=20
Authorization: Bearer <admin_token>
```

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `.env.example`)
4. Run database migrations: `npm run migrate`
5. Start the server: `npm start`

## Environment Variables

Create a `.env` file with the following variables:

```
DB_HOST=localhost
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=leave_management
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=24h
```

## Usage

### Admin Access
1. Login with admin credentials
2. Navigate to the Admin tab
3. Use the Password Reset Management section to:
   - Reset all employee passwords
   - Search and reset individual user passwords

### Security Notes
- All password reset actions are logged in the audit system
- Bulk password resets require explicit confirmation
- Current admin is always excluded from bulk password resets
- Passwords must be at least 6 characters long
- All password reset actions require admin privileges

## API Documentation

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Register new employee (admin only)
- `POST /api/auth/reset-all-passwords` - Reset all passwords (admin only)
- `POST /api/auth/reset-user-password/:userId` - Reset individual password (admin only)

### Users
- `GET /api/users` - Get all users (HR/Admin only)
- `GET /api/users/:id/leave-balance` - Get user's leave balance
- `PUT /api/users/:id/leave-balance` - Update user's leave balance (HR/Admin only)

### Leave Management
- `POST /api/leaves` - Apply for leave
- `GET /api/leaves` - Get leave requests
- `PUT /api/leaves/:id` - Update leave request
- `DELETE /api/leaves/:id` - Cancel leave request

### Audit Logs
- `GET /api/audit` - Get audit logs (Admin only)
- `GET /api/audit/export` - Export audit logs (Admin only)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.