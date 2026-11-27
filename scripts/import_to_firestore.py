#!/usr/bin/env python3
"""把 backup/latest.json 的数据一次性导入 Firebase Firestore。
用法：先在 config.js 填好 projectId / apiKey，然后运行：python scripts/import_to_firestore.py
"""
import json
import os
import re
import urllib.request
import urllib.error
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_config():
    src = open(os.path.join(ROOT, 'config.js'), encoding='utf-8').read()
    pid = re.search(r"projectId:\s*'([^']+)'", src)
    key = re.search(r"apiKey:\s*'([^']+)'", src)
    if not pid or not key:
        raise SystemExit('无法从 config.js 读取配置')
    return pid.group(1), key.group(1)


def to_field(v):
    if v is None:
        return {'nullValue': None}
    if isinstance(v, bool):
        return {'booleanValue': v}
    if isinstance(v, int):
        return {'integerValue': str(v)}
    if isinstance(v, float):
        return {'doubleValue': v}
    if isinstance(v, list):
        return {'arrayValue': {'values': [to_field(x) for x in v]}}
    return {'stringValue': str(v)}


def doc_id(table, row):
    if row.get('id'):
        return str(row['id'])
    if row.get('key'):
        return str(row['key'])
    if table == 'wb_votes':
        return '%s__%s' % (row['day_key'], row['voter_id'])
    raise ValueError('无法确定文档 ID: %r' % row)


def main():
    project, key = load_config()
    if project.startswith('YOUR_') or key.startswith('YOUR_'):
        raise SystemExit('请先在 config.js 中填入真实的 Firebase 项目 ID 和 Web API Key')
    data = json.load(open(os.path.join(ROOT, 'backup', 'latest.json'), encoding='utf-8'))
    base = 'https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents' % project
    total = 0
    for table, rows in data['tables'].items():
        for row in rows:
            rid = doc_id(table, row)
            fields = {k: to_field(v) for k, v in row.items()}
            url = '%s/%s/%s?key=%s' % (base, table, urllib.parse.quote(rid, safe=''), key)
            req = urllib.request.Request(url, data=json.dumps({'fields': fields}).encode('utf-8'),
                                         headers={'Content-Type': 'application/json'}, method='PATCH')
            try:
                with urllib.request.urlopen(req, timeout=20) as res:
                    res.read()
            except urllib.error.HTTPError as e:
                raise SystemExit('导入失败 %s/%s: HTTP %s %s' % (table, rid, e.code, e.read()[:300]))
            total += 1
            print('导入 %s/%s' % (table, rid))
    print('完成，共 %d 条' % total)


if __name__ == '__main__':
    main()
