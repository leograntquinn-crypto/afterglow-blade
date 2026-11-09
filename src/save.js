// 存档：本地（localStorage）+ 云端（发布后的页面里，按账号私有保存，换设备也能继续）
//
// 策略：启动时先读本地存档立刻开玩；云端连上后，哪边的 savedAt 更新就用哪边。
// 云端写入一次只发一个请求，期间的新改动合并成下一次写入。

import { migrateSave } from './gear/migrate.js';

import { newSave } from './progression.js';

const KEY = 'afterglow-blade-save-v1';

function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return migrateSave(s);
  } catch {
    return null;
  }
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export class SaveStore {
  constructor() {
    this.data = loadLocal() || newSave();
    this.ref = null;
    this.status = 'local'; // 'local' | 'cloud'
    this.pending = false;
    this.again = false;
  }

  // onNewer：云端存档比本地新时调用
  async connectCloud(onNewer) {
    try {
      if (!window.claude?.use) return;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      this.ref = db.doc(`data/users/${id}/save`);
      const snap = await withTimeout(this.ref.get(), 10000);
      this.status = 'cloud';
      const cloud = snap.exists ? migrateSave(snap.data()) : null;
      if (cloud && cloud.v === 2 && (cloud.savedAt || 0) > (this.data.savedAt || 0)) {
        if (onNewer(() => (this.data = migrateSave(cloud)))) this.writeLocal();
      } else if (this.data.savedAt) {
        this.pushCloud();
      }
    } catch {
      this.ref = null;
      this.status = 'local';
    }
  }

  writeLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* 无痕模式等 */ }
  }

  save() {
    this.data.savedAt = Date.now();
    this.writeLocal();
    this.pushCloud();
  }

  pushCloud() {
    if (!this.ref) return;
    if (this.pending) { this.again = true; return; }
    this.pending = true;
    const body = JSON.parse(JSON.stringify(this.data));
    this.ref.set(body)
      .then(() => { this.status = 'cloud'; })
      .catch((e) => {
        if (e?.code !== 'unavailable' && e?.code !== 'resource_exhausted') { this.ref = null; this.status = 'local'; }
      })
      .finally(() => {
        this.pending = false;
        if (this.again) { this.again = false; this.pushCloud(); }
      });
  }

  wipe() {
    this.data = newSave();
    this.save();
  }
}
