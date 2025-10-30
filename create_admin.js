const bcrypt = require('bcrypt');
const fs = require('fs-extra');
const path = require('path');

// function validatePassword(password) {
//   return password.length >= 7 && 
//          /[A-Z]/.test(password) && 
//          /[0-9!@#$%^&*]/.test(password);
// }

async function main() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';
  const role = process.argv[4] || 'admin';

  if (!username || !password) {
    console.error('Usage: node create_admin.js [username] [password] [role]');
    console.error('Example: node create_admin.js admin password123 admin');
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    let users = {};
    
    // Load existing users if any
    try {
      users = await fs.readJson(path.join(__dirname, 'users.json'));
    } catch (e) {
      // File doesn't exist, create new
    }
    
    users[username] = { 
      passwordHash: hash, 
      role: role,
      created: new Date().toISOString()
    };

    await fs.writeJson(path.join(__dirname, 'users.json'), users, { spaces: 2 });
    console.log('✅ User created successfully!');
    console.log(`👤 Username: ${username}`);
    console.log(`🔑 Role: ${role}`);
    console.log('📁 Saved to: users.json');
    console.log('🚨 IMPORTANT: Change the default password and keep users.json secure!');
  } catch (err) {
    console.error('❌ Error creating user:', err.message);
    process.exit(1);
  }
}

main();