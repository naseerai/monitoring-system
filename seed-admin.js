#!/usr/bin/env node
import dotenv from 'dotenv';
import pkg from 'pg';
import bcrypt from 'bcrypt';

dotenv.config();

const { Pool } = pkg;

const [,, email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: node seed-admin.js <email> <password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (email) DO UPDATE 
       SET password_hash = EXCLUDED.password_hash, role = 'admin'
       RETURNING id, email, role, created_at`,
      [email.toLowerCase().trim(), hash]
    );

    console.log('\n✅ Admin user created / updated:');
    console.log('   ID:    ', rows[0].id);
    console.log('   Email: ', rows[0].email);
    console.log('   Role:  ', rows[0].role);
    console.log('\nYou can now log in at http://localhost:5173\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();