/*
  scripts/reset_al_balances.js

  Safe script to preview or reset Annual Leave (AL) balances for employees.

  Usage:
    # Dry run (preview):
    node scripts/reset_al_balances.js

    # Apply changes:
    node scripts/reset_al_balances.js --run

  Notes:
    - Operates on LeaveType names that include 'annual' (case-insensitive).
    - By default it will reset current financial year balances to the leave type's defaultDays
      (set totalDays = defaultDays, usedDays = 0, remainingDays = defaultDays, carriedOverDays = 0).
    - The script runs inside a transaction when applying changes.
    - Always run a DB backup before applying changes in production.
*/

const { Sequelize } = require('sequelize');
const path = require('path');

async function main() {
  const runFlag = process.argv.includes('--run');
  console.log('Reset AL balances script');
  console.log('Mode:', runFlag ? 'APPLY' : 'DRY-RUN (preview)');

  // Load project modules (assumes running from project root)
  const modelsPath = path.join(__dirname, '..', 'models');
  const models = require(modelsPath);
  const { LeaveType, LeaveBalance, User, sequelize } = models;

  // Determine current financial year using same logic as utils/leaveBalance.getCurrentFinancialYear
  function getCurrentFinancialYear() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    return currentMonth <= 3 ? currentYear - 1 : currentYear;
  }

  const year = getCurrentFinancialYear();
  console.log('Target financial year:', year);

  // Find annual leave types
  const annualLeaveTypes = await LeaveType.findAll({ where: { isActive: true } });
  const matched = annualLeaveTypes.filter(lt => lt.name && lt.name.toLowerCase().includes('annual'));

  if (matched.length === 0) {
    console.warn('No leave types with "annual" found. Aborting.');
    process.exit(1);
  }

  console.log('Found annual leave types:');
  matched.forEach(m => console.log(`  id=${m.id} name="${m.name}" defaultDays=${m.defaultDays}`));

  // Get active employees
  const employees = await User.findAll({ where: { isActive: true }, attributes: ['id','employeeId','firstName','lastName'] });
  console.log(`Found ${employees.length} active employee(s)`);

  // Build preview of changes
  const preview = [];
  for (const emp of employees) {
    for (const lt of matched) {
      const expectedTotal = lt.defaultDays;
      const desired = {
        userId: emp.id,
        leaveTypeId: lt.id,
        year,
        totalDays: expectedTotal,
        usedDays: 0,
        remainingDays: expectedTotal,
        carriedOverDays: 0,
        maxCarryOver: lt.name.toLowerCase().includes('annual') ? 5 : 0
      };

      // Look for existing balance
      const existing = await LeaveBalance.findOne({ where: { userId: emp.id, leaveTypeId: lt.id, year } });

      preview.push({ employee: `${emp.employeeId} ${emp.firstName} ${emp.lastName}`, leaveType: lt.name, existing: existing ? existing.toJSON() : null, desired });
    }
  }

  // Print preview summary (first 20 rows)
  console.log('\nPreview (first 20):');
  preview.slice(0, 20).forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.employee} — ${p.leaveType}`);
    if (p.existing) {
      console.log('   existing -> totalDays:', p.existing.totalDays, 'usedDays:', p.existing.usedDays, 'remainingDays:', p.existing.remainingDays, 'carriedOver:', p.existing.carriedOverDays);
      console.log('   desired  -> totalDays:', p.desired.totalDays, 'usedDays:', p.desired.usedDays, 'remainingDays:', p.desired.remainingDays);
    } else {
      console.log('   existing -> (none)');
      console.log('   desired  -> create balance with totalDays:', p.desired.totalDays);
    }
  });

  console.log(`\nTotal rows to examine: ${preview.length}`);

  if (!runFlag) {
    console.log('\nDRY-RUN complete. To apply changes run with --run');
    process.exit(0);
  }

  // Apply changes inside transaction
  const t = await sequelize.transaction();
  try {
    let updatedCount = 0;
    let createdCount = 0;

    for (const p of preview) {
      const e = p.existing;
      if (e) {
        // Update existing
        await LeaveBalance.update({
          totalDays: p.desired.totalDays,
          usedDays: 0,
          remainingDays: p.desired.remainingDays,
          carriedOverDays: 0,
          maxCarryOver: p.desired.maxCarryOver
        }, { where: { id: e.id }, transaction: t });
        updatedCount++;
      } else {
        // Create new balance
        await LeaveBalance.create({
          userId: p.desired.userId,
          leaveTypeId: p.desired.leaveTypeId,
          year: p.desired.year,
          totalDays: p.desired.totalDays,
          usedDays: 0,
          remainingDays: p.desired.remainingDays,
          carriedOverDays: 0,
          maxCarryOver: p.desired.maxCarryOver,
          isActive: true
        }, { transaction: t });
        createdCount++;
      }
    }

    await t.commit();
    console.log(`\nAPPLY complete. Updated: ${updatedCount}, Created: ${createdCount}`);
    process.exit(0);
  } catch (err) {
    console.error('Error applying changes, rolling back:', err);
    await t.rollback();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
