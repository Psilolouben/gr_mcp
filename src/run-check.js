'use strict';

const { checkGameChanges } = require('./checker');
const { pushTelegramUpdate } = require('./telegram-push');

checkGameChanges()
  .then((r) => pushTelegramUpdate(r))
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
