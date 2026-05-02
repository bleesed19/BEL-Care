const bcrypt = require('bcryptjs');

async function generate() {
    const password = 'password123';
    const hash = await bcrypt.hash(password, 10);
    console.log('Password:', password);
    console.log('Hash:', hash);
    console.log('\nCopy this hash and run SQL:');
    console.log(`UPDATE users SET password = '${hash}' WHERE email = 'superadmin@belcare.com';`);
}

generate();