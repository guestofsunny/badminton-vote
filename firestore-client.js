/* 约球投票 · Firestore 数据层
 * 提供与之前 WorkBuddy cloud.database 相同的小型链接口，页面逻辑无需改动。
 * 只使用浏览器原生 fetch + Firestore REST API，可运行在任意静态托管（含 GitHub Pages）。
 */
(function (global) {
  'use strict';

  function toField(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toField) } };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    return { stringValue: String(v) };
  }

  function fromField(f) {
    if (!f) return null;
    if ('stringValue' in f) return f.stringValue;
    if ('integerValue' in f) return parseInt(f.integerValue, 10);
    if ('doubleValue' in f) return Number(f.doubleValue);
    if ('booleanValue' in f) return f.booleanValue;
    if ('nullValue' in f) return null;
    if ('timestampValue' in f) return f.timestampValue;
    if ('arrayValue' in f) return (f.arrayValue.values || []).map(fromField);
    if ('mapValue' in f) {
      var o = {};
      Object.keys(f.mapValue.fields || {}).forEach(function (k) { o[k] = fromField(f.mapValue.fields[k]); });
      return o;
    }
    return null;
  }

  function docId(table, row, fallback) {
    if (row && row.id !== undefined && row.id !== null && row.id !== '') return String(row.id);
    if (row && row.key !== undefined && row.key !== null && row.key !== '') return String(row.key);
    if (table === 'wb_votes' && row) return String(row.day_key) + '__' + String(row.voter_id);
    return fallback || '';
  }

  function docName(result) {
    var n = String(result && result.name || '');
    return n.slice(n.lastIndexOf('/') + 1);
  }

  function Query(cfg, table) {
    this.cfg = cfg;
    this.table = table;
    this.op = 'select';
    this.payload = null;
    this.filters = [];
  }

  Query.prototype.select = function () { this.op = 'select'; return this; };
  Query.prototype.insert = function (row) { this.op = 'insert'; this.payload = row; return this; };
  Query.prototype.upsert = function (row) { this.op = 'upsert'; this.payload = row; return this; };
  Query.prototype.update = function (obj) { this.op = 'update'; this.payload = obj; return this; };
  Query.prototype.delete = function () { this.op = 'delete'; return this; };
  Query.prototype.eq = function (col, val) { this.filters.push([col, val]); return this; };

  Query.prototype.base = function () {
    return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(this.cfg.projectId) +
      '/databases/(default)/documents/' + encodeURIComponent(this.table);
  };

  Query.prototype.request = function (url, options) {
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    var full = url + sep + 'key=' + encodeURIComponent(this.cfg.apiKey);
    var self = this;
    return fetch(full, options).then(function (res) {
      return res.text().then(function (txt) {
        var body = null;
        try { body = txt ? JSON.parse(txt) : null; } catch (e) {}
        if (!res.ok) {
          var msg = (body && body.error && body.error.message) || ('HTTP ' + res.status);
          return { data: null, error: new Error(self.table + ': ' + msg) };
        }
        return { data: body, error: null };
      });
    }).catch(function (e) { return { data: null, error: e }; });
  };

  Query.prototype.list = function () {
    var self = this;
    return this.request(this.base() + '?pageSize=1000', { method: 'GET', headers: { 'Content-Type': 'application/json' } })
      .then(function (r) {
        if (r.error || !r.data) return r;
        var docs = (r.data.documents || []).map(function (d) {
          var row = {};
          Object.keys(d.fields || {}).forEach(function (k) { row[k] = fromField(d.fields[k]); });
          if (row.id === undefined) row.id = docName(d);
          return row;
        });
        return { data: docs, error: null, names: (r.data.documents || []).map(docName) };
      });
  };

  Query.prototype.matches = function (row) {
    return this.filters.every(function (f) { return String(row[f[0]]) === String(f[1]); });
  };

  Query.prototype.execute = function () {
    var self = this;
    var body;

    if (this.op === 'select') return this.list().then(function (r) { return { data: r.data || [], error: r.error }; });

    if (this.op === 'insert' || this.op === 'upsert') {
      var id = docId(this.table, this.payload);
      var fields = {};
      Object.keys(this.payload || {}).forEach(function (k) { fields[k] = toField(self.payload[k]); });
      body = JSON.stringify({ fields: fields });
      if (id) {
        return this.request(this.base() + '/' + encodeURIComponent(id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body
        }).then(function (r) { return { data: r.data ? [r.data] : [], error: r.error }; });
      }
      return this.request(this.base(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body
      }).then(function (r) { return { data: r.data ? [r.data] : [], error: r.error }; });
    }

    if (this.op === 'update' || this.op === 'delete') {
      return this.list().then(function (r) {
        if (r.error || !r.data) return { data: [], error: r.error };
        var names = r.names || [];
        var targets = r.data.filter(function (row, i) { return self.matches(row) && names[i]; });
        if (!targets.length) return { data: [], error: null };
        var jobs = targets.map(function (row) {
          var url = self.base() + '/' + encodeURIComponent(row.id);
          if (self.op === 'delete') return self.request(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } });
          var fields = {};
          Object.keys(self.payload || {}).forEach(function (k) { fields[k] = toField(self.payload[k]); });
          return self.request(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: fields })
          });
        });
        return Promise.all(jobs).then(function (rs) {
          var err = null;
          rs.forEach(function (x) { if (x.error && !err) err = x.error; });
          return { data: [], error: err };
        });
      });
    }

    return Promise.resolve({ data: [], error: new Error('unknown operation') });
  };

  Query.prototype.then = function (ok, fail) { return this.execute().then(ok, fail); };
  Query.prototype.catch = function (fail) { return this.execute().catch(fail); };

  global.WorkBuddyCloud = {
    createWorkBuddyCloud: function (cfg) {
      if (!cfg || !cfg.projectId || !cfg.apiKey) throw new Error('Firestore 配置缺失');
      return {
        database: {
          from: function (table) { return new Query(cfg, table); }
        }
      };
    }
  };
})(window);
