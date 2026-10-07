// Executes the production Lua script with an in-memory Redis command boundary.
// This validates Lua control flow and cjson's empty-table behavior, without
// opening a network port or connecting tests to the production database.
import fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring } = fengari;
const JSON_NULL = {};

function push(L, value) {
  if (value === null) lua.lua_pushlightuserdata(L, JSON_NULL);
  else if (value === undefined) lua.lua_pushnil(L);
  else if (typeof value === 'string') lua.lua_pushstring(L, to_luastring(value));
  else if (typeof value === 'boolean') lua.lua_pushboolean(L, value);
  else if (typeof value === 'number') lua.lua_pushnumber(L, value);
  else {
    lua.lua_newtable(L);
    for (const [key, item] of Object.entries(value)) {
      push(L, item);
      if (Array.isArray(value)) lua.lua_rawseti(L, -2, Number(key) + 1);
      else lua.lua_setfield(L, -2, to_luastring(key));
    }
  }
}

function read(L, index) {
  const position = lua.lua_absindex(L, index);
  switch (lua.lua_type(L, position)) {
    case lua.LUA_TNIL: return undefined;
    case lua.LUA_TLIGHTUSERDATA: return null;
    case lua.LUA_TBOOLEAN: return Boolean(lua.lua_toboolean(L, position));
    case lua.LUA_TNUMBER: return lua.lua_tonumber(L, position);
    case lua.LUA_TSTRING: return lua.lua_tojsstring(L, position);
    case lua.LUA_TTABLE: {
      const entries = [];
      lua.lua_pushnil(L);
      while (lua.lua_next(L, position)) {
        entries.push([read(L, -2), read(L, -1)]);
        lua.lua_pop(L, 1);
      }
      if (entries.length && entries.every(([key]) => Number.isInteger(key) && key > 0 && key <= entries.length)) {
        const array = [];
        for (const [key, value] of entries) array[key - 1] = value;
        return array;
      }
      return Object.fromEntries(entries);
    }
    default: throw new Error('Unsupported Lua fixture value');
  }
}

export function executeLua(script, keys, args, redisCall) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const library = (name, functions, values = {}) => {
    lua.lua_newtable(L);
    for (const [key, fn] of Object.entries(functions)) {
      lua.lua_pushjsfunction(L, state => fn(state));
      lua.lua_setfield(L, -2, to_luastring(key));
    }
    for (const [key, value] of Object.entries(values)) { push(L, value); lua.lua_setfield(L, -2, to_luastring(key)); }
    lua.lua_setglobal(L, to_luastring(name));
  };
  library('cjson', {
    decode: state => { push(state, JSON.parse(read(state, 1))); return 1; },
    encode: state => { push(state, JSON.stringify(read(state, 1))); return 1; }
  }, { null: null });
  library('redis', {
    call: state => {
      const command = Array.from({ length: lua.lua_gettop(state) }, (_, i) => read(state, i + 1));
      // Redis RESP2 maps a missing GET to Lua false, rather than nil.
      push(state, redisCall(...command) ?? false);
      return 1;
    },
    error_reply: state => { throw new Error(read(state, 1)); }
  });
  push(L, keys); lua.lua_setglobal(L, to_luastring('KEYS'));
  push(L, args.map(String)); lua.lua_setglobal(L, to_luastring('ARGV'));
  try {
    const status = lauxlib.luaL_dostring(L, to_luastring(script));
    if (status !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
    return read(L, -1);
  } finally { lua.lua_close(L); }
}
