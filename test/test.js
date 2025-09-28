const request = require('supertest');
const { app } = require('../server');

describe('Datec Leave Management System API', () => {
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Authentication', () => {
    it('should reject login with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid@email.com',
          password: 'wrongpassword'
        })
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
    });

    it('should validate login input', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: ''
        })
        .expect(400);
      
      expect(response.body).toHaveProperty('error', 'Validation Error');
      expect(response.body).toHaveProperty('details');
    });
  });

  describe('Protected Routes', () => {
    it('should reject access without token', async () => {
      const response = await request(app)
        .get('/api/users')
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });
}); 