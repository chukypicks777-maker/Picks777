// Select inside Redis so routine reads never transfer the whole access database.
// The existing durable key and write transactions remain compatible.
export const ACCESS_READ_SCRIPT = `
local raw=redis.call('GET',KEYS[1])
local db=raw and cjson.decode(raw) or {}
local kind=ARGV[1]
local query=ARGV[2]
local function userById(id)
  for _,user in ipairs(db.users or {}) do
    if user.id==id or user.googleId==id or (type(user.email)=='string' and string.lower(user.email)==string.lower(id)) then return user end
  end
end
local function codeByName(name)
  for _,code in ipairs(db.codes or {}) do
    if code.code==name and (not code.deletedAt or code.deletedAt==cjson.null or code.deletedAt=='') then return code end
  end
end
if kind=='session' then
  local result={revoked=(db.revokedSessions or {})[query]~=nil}
  if not result.revoked and ARGV[3]~='' then
    local user=userById(ARGV[3])
    if user then
      result.user=user
      if type(user.vipCode)=='string' then result.code=codeByName(string.upper(user.vipCode)) end
    end
  end
  return cjson.encode(result)
elseif kind=='user' then return cjson.encode(userById(query) or cjson.null)
elseif kind=='code' then return cjson.encode(codeByName(query) or cjson.null)
elseif kind=='revoked' then return cjson.encode((db.revokedSessions or {})[query]~=nil)
elseif kind=='users' then
  if not db.users or #db.users==0 then return '[]' end
  return cjson.encode(db.users)
elseif kind=='codes' then
  local codes={}
  for _,code in ipairs(db.codes or {}) do if not code.deletedAt or code.deletedAt==cjson.null or code.deletedAt=='' then table.insert(codes,code) end end
  if #codes==0 then return '[]' end
  return cjson.encode(codes)
elseif kind=='ai' then return cjson.encode({aiConfig=db.aiConfig,settings=db.settings})
elseif kind=='social' then return cjson.encode(db.socialSettings or cjson.null)
end
return redis.error_reply('unknown access projection')`;

export function selectAccess(db, kind, query = '', userId = '') {
  const user = id => (db.users || []).find(item => item.id === id || item.googleId === id || item.email?.toLowerCase() === String(id).toLowerCase());
  const code = name => (db.codes || []).find(item => item.code === name && !item.deletedAt);
  switch (kind) {
    case 'session': {
      const revoked = Boolean(db.revokedSessions?.[query]);
      const record = !revoked && userId ? user(userId) : undefined;
      return { revoked, user: record, code: record?.vipCode ? code(record.vipCode.toUpperCase()) : undefined };
    }
    case 'user': return user(query);
    case 'code': return code(query);
    case 'revoked': return Boolean(db.revokedSessions?.[query]);
    case 'users': return db.users || [];
    case 'codes': return (db.codes || []).filter(item => !item.deletedAt);
    case 'ai': return { aiConfig: db.aiConfig, settings: db.settings };
    case 'social': return db.socialSettings;
    default: throw new Error('Lectura de almacenamiento no válida.');
  }
}

// Redis cjson represents an empty JSON array as an empty Lua table and encodes
// it as {}. Restore the schema's array fields before handing records to callers.
export function normalizeAccessRead(kind, result) {
  const devices = record => {
    if (record?.devices && !Array.isArray(record.devices) && Object.keys(record.devices).length === 0) record.devices = [];
    return record;
  };
  if (kind === 'session') { devices(result.user); devices(result.code); }
  else if (kind === 'user' || kind === 'code') devices(result);
  else if (kind === 'users' || kind === 'codes') result.forEach(devices);
  return result === null ? undefined : result;
}
