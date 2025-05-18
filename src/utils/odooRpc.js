const xmlrpc = require('xmlrpc');
require('dotenv').config();

const url = process.env.ODOO_XMLRPC_URL;
const db = process.env.ODOO_DB;
const username = process.env.ODOO_USER;
const password = process.env.ODOO_PASS;

async function authenticate() {
  const client = xmlrpc.createClient({ url: `${url}/xmlrpc/2/common` });

  return new Promise((resolve, reject) => {
    client.methodCall('authenticate', [db, username, password, {}], (err, uid) => {
      if (err) return reject(err);
      resolve(uid);
    });
  });
}

function createClient() {
  return xmlrpc.createClient({ url: `${url}/xmlrpc/2/object` });
}

async function call(model, method, args, kwargs = {}) {
  const uid = await authenticate();
  const client = createClient();

  return new Promise((resolve, reject) => {
    client.methodCall(
      'execute_kw',
      [db, uid, password, model, method, args, kwargs],
      (err, value) => {
        if (err) return reject(err);
        resolve(value);
      }
    );
  });
}

module.exports = {
  call,
};
