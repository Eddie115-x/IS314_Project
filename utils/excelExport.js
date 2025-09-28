const ExcelJS = require('exceljs');
const { Audit, User } = require('../models');

class ExcelExporter {
  constructor() {
    this.workbook = new ExcelJS.Workbook();
    this.workbook.creator = 'Datec Leave Management System';
    this.workbook.lastModifiedBy = 'System';
    this.workbook.created = new Date();
    this.workbook.modified = new Date();
  }

  async exportAuditLogsToExcel(filters = {}) {
    try {
      console.log('🚀 Starting Excel export - FULL VERSION...');
      
      // Get audit logs
      const auditLogs = await Audit.findAll({
        include: [{
          model: User,
          as: 'user',
          attributes: ['firstName', 'lastName', 'email']
        }],
        order: [['createdAt', 'DESC']]
      });

      console.log(`📊 Found ${auditLogs.length} audit logs`);

      if (!auditLogs || auditLogs.length === 0) {
        console.warn('⚠️ No audit logs found');
        return this.workbook;
      }

      // Create new workbook
      this.workbook = new ExcelJS.Workbook();
      this.workbook.creator = 'Datec Leave Management System';
      this.workbook.lastModifiedBy = 'System';
      this.workbook.created = new Date();
      this.workbook.modified = new Date();

      // Create main worksheet with all data
      const mainWorksheet = this.workbook.addWorksheet('All Audit Logs');
      
      // Define headers
      const headers = [
        'ID',
        'User',
        'Action',
        'Entity Type',
        'Entity ID',
        'Category',
        'Severity',
        'Description',
        'IP Address',
        'User Agent',
        'Success',
        'Error Message',
        'Created At'
      ];

      console.log('📝 Adding headers to main worksheet...');
      
      // Add headers
      mainWorksheet.addRow(headers);
      
      // Style header row
      const headerRow = mainWorksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' }
      };
      headerRow.font.color = { argb: 'FFFFFFFF' };

      console.log('📊 Processing all data...');
      
      // Process all rows
      for (let i = 0; i < auditLogs.length; i++) {
        const audit = auditLogs[i];
        
        // Get user name
        let userName = 'System';
        if (audit.user) {
          const firstName = audit.user.firstName || '';
          const lastName = audit.user.lastName || '';
          userName = `${firstName} ${lastName}`.trim() || 'System';
        }

        // Create row data
        const rowData = [
          audit.id || '',
          userName,
          audit.action || '',
          audit.entityType || '',
          audit.entityId || '',
          audit.category || '',
          audit.severity || '',
          audit.description || '',
          audit.ipAddress || '',
          audit.userAgent ? (audit.userAgent.substring(0, 50) + '...') : '',
          audit.isSuccessful ? 'Yes' : 'No',
          audit.errorMessage || '',
          audit.createdAt ? new Date(audit.createdAt).toLocaleString() : ''
        ];

        // Add row
        mainWorksheet.addRow(rowData);
        
        // Log progress every 500 rows
        if ((i + 1) % 500 === 0) {
          console.log(`✅ Processed ${i + 1} rows...`);
        }
      }

      // Set column widths for main worksheet
      for (let i = 1; i <= 13; i++) {
        mainWorksheet.getColumn(i).width = 15;
      }

      console.log(`✅ Created main worksheet with ${auditLogs.length} rows`);

      // Create category-specific worksheets
      const categories = {};
      auditLogs.forEach(audit => {
        const category = audit.category || 'Other';
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(audit);
      });

      console.log('📊 Creating category worksheets...');

      for (const [category, categoryLogs] of Object.entries(categories)) {
        if (categoryLogs.length > 0) {
          const worksheet = this.workbook.addWorksheet(category.charAt(0).toUpperCase() + category.slice(1));
          
          // Add headers
          worksheet.addRow(headers);
          
          // Style header row
          const catHeaderRow = worksheet.getRow(1);
          catHeaderRow.font = { bold: true };
          catHeaderRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' }
          };
          catHeaderRow.font.color = { argb: 'FFFFFFFF' };

          // Add data rows
          for (const audit of categoryLogs) {
            let userName = 'System';
            if (audit.user) {
              const firstName = audit.user.firstName || '';
              const lastName = audit.user.lastName || '';
              userName = `${firstName} ${lastName}`.trim() || 'System';
            }

            const rowData = [
              audit.id || '',
              userName,
              audit.action || '',
              audit.entityType || '',
              audit.entityId || '',
              audit.category || '',
              audit.severity || '',
              audit.description || '',
              audit.ipAddress || '',
              audit.userAgent ? (audit.userAgent.substring(0, 50) + '...') : '',
              audit.isSuccessful ? 'Yes' : 'No',
              audit.errorMessage || '',
              audit.createdAt ? new Date(audit.createdAt).toLocaleString() : ''
            ];

            worksheet.addRow(rowData);
          }

          // Set column widths
          for (let i = 1; i <= 13; i++) {
            worksheet.getColumn(i).width = 15;
          }

          console.log(`✅ Created '${category}' worksheet with ${categoryLogs.length} rows`);
        }
      }

      // Create summary worksheet
      const summaryWorksheet = this.workbook.addWorksheet('Summary');
      
      // Add summary statistics
      const totalLogs = auditLogs.length;
      const successfulLogs = auditLogs.filter(log => log.isSuccessful).length;
      const failedLogs = totalLogs - successfulLogs;
      
      summaryWorksheet.addRow(['Audit Logs Summary']);
      summaryWorksheet.addRow([]);
      summaryWorksheet.addRow(['Total Logs', totalLogs]);
      summaryWorksheet.addRow(['Successful Actions', successfulLogs]);
      summaryWorksheet.addRow(['Failed Actions', failedLogs]);
      summaryWorksheet.addRow(['Success Rate', totalLogs > 0 ? `${((successfulLogs / totalLogs) * 100).toFixed(2)}%` : '0%']);
      summaryWorksheet.addRow([]);
      
      // Category breakdown
      summaryWorksheet.addRow(['Category', 'Count', 'Percentage']);
      for (const [category, categoryLogs] of Object.entries(categories)) {
        summaryWorksheet.addRow([
          category,
          categoryLogs.length,
          totalLogs > 0 ? `${((categoryLogs.length / totalLogs) * 100).toFixed(2)}%` : '0%'
        ]);
      }

      // Style summary worksheet
      const titleRow = summaryWorksheet.getRow(1);
      titleRow.font = { bold: true, size: 14 };
      
      const headerRows = [3, 9];
      headerRows.forEach(rowNum => {
        const row = summaryWorksheet.getRow(rowNum);
        if (row) {
          row.font = { bold: true };
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE7E6E6' }
          };
        }
      });

      // Set column widths for summary
      for (let i = 1; i <= 3; i++) {
        summaryWorksheet.getColumn(i).width = 20;
      }

      console.log('✅ Created summary worksheet');
      console.log('✅ Excel export completed - FULL VERSION');
      
      return this.workbook;
    } catch (error) {
      console.error('❌ Error in Excel export:', error);
      throw error;
    }
  }

  async exportToBuffer() {
    try {
      return await this.workbook.xlsx.writeBuffer();
    } catch (error) {
      console.error('❌ Error writing to buffer:', error);
      throw error;
    }
  }

  sanitizeCellValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).substring(0, 32000); // Excel cell limit
  }

  validateFilters(filters) {
    const validated = {};
    
    if (filters.userId) {
      const userId = parseInt(filters.userId);
      if (!isNaN(userId)) {
        validated.userId = userId;
      }
    }
    
    if (filters.category && typeof filters.category === 'string') {
      validated.category = filters.category;
    }
    
    if (filters.severity && typeof filters.severity === 'string') {
      validated.severity = filters.severity;
    }
    
    if (filters.action && typeof filters.action === 'string') {
      validated.action = filters.action;
    }
    
    if (filters.entityType && typeof filters.entityType === 'string') {
      validated.entityType = filters.entityType;
    }
    
    if (filters.isSuccessful !== undefined) {
      validated.isSuccessful = Boolean(filters.isSuccessful);
    }
    
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      if (!isNaN(startDate.getTime())) {
        validated.startDate = startDate;
      }
    }
    
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      if (!isNaN(endDate.getTime())) {
        validated.endDate = endDate;
      }
    }
    
    return validated;
  }

  buildWhereClause(filters) {
    const whereClause = {};
    
    if (filters.userId) {
      whereClause.userId = filters.userId;
    }
    
    if (filters.category) {
      whereClause.category = filters.category;
    }
    
    if (filters.severity) {
      whereClause.severity = filters.severity;
    }
    
    if (filters.action) {
      whereClause.action = filters.action;
    }
    
    if (filters.entityType) {
      whereClause.entityType = filters.entityType;
    }
    
    if (filters.isSuccessful !== undefined) {
      whereClause.isSuccessful = filters.isSuccessful;
    }
    
    if (filters.startDate || filters.endDate) {
      whereClause.createdAt = {};
      
      if (filters.startDate) {
        whereClause.createdAt.$gte = filters.startDate;
      }
      
      if (filters.endDate) {
        whereClause.createdAt.$lte = filters.endDate;
      }
    }
    
    return whereClause;
  }
}

module.exports = ExcelExporter; 