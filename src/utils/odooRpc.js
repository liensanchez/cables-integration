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

// Helper methods
async function search(model, domain, options = {}) {
  return call(model, 'search', [domain], options);
}

async function searchRead(model, domain, fields, options = {}) {
  return call(model, 'search_read', [domain], { fields, ...options });
}

async function read(model, ids, fields, options = {}) {
  return call(model, 'read', [ids], { fields, ...options });
}

async function create(model, data) {
  return call(model, 'create', [data]);
}

async function update(model, ids, data) {
  return call(model, 'write', [ids, data]);
}

async function remove(model, ids) {
  return call(model, 'unlink', [ids]);
}

module.exports = {
  call,
  search,
  searchRead,
  read,
  create,
  update,
  remove,
};