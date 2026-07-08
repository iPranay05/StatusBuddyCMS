const fs = require('fs');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (url && key) {
  const envContent = `window.env = {
  SUPABASE_URL: '${url}',
  SUPABASE_KEY: '${key}'
};
`;
  fs.writeFileSync('env.js', envContent);
  console.log('Successfully generated env.js from environment variables.');
} else {
  console.log('SUPABASE_URL or SUPABASE_KEY not set. Skipping env.js generation.');
}
