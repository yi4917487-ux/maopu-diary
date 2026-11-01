/* ===========================================================
 * 猫扑 & 我 · 小日子 —— 前端逻辑
 * 两种运行方式：
 *   1) 直接双击 index.html：数据存在浏览器 localStorage，完全离线可用
 *   2) 用 start.bat 启动小服务：数据存 data.json，局域网多设备可一起编辑
 * =========================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'maopu.diary.v1';
  var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  var IMG_MAX = 1000;
  var IMG_QUALITY = 0.78;

  /* 云同步配置存在浏览器 localStorage，不写进网站代码 */
  var CLOUD_CONFIG_KEY = 'maopu.cloud';
  function readCloudConfig() {
    try {
      var raw = localStorage.getItem(CLOUD_CONFIG_KEY);
      if (!raw) return null;
      var cfg = JSON.parse(raw);
      return cfg && cfg.gistId && cfg.token ? cfg : null;
    } catch (err) { return null; }
  }
  function writeCloudConfig(cfg) {
    try { localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(cfg)); return true; }
    catch (err) { return false; }
  }
  var cloudConfig = readCloudConfig();
  var cloudTimer = null;

  var state = {
    mode: 'local',
    meta: { me: '我', her: '猫扑', startDate: '', tagline: '' },
    records: [],
    author: (function () {
      try { return localStorage.getItem('maopu.author') === 'her' ? 'her' : 'me'; }
      catch (err) { return 'me'; }
    }()),
    filters: { keyword: '', month: '', tag: '', author: '' },
    editingImages: [],
    cloudUpdatedAt: ''
  };

  var els = {};
  var toastTimer = null;

  /* ---------------- 小工具 ---------------- */
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function isoDate(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function todayISO() { return isoDate(0); }
  function parseISO(iso) {
    var parts = String(iso || '').split('-').map(Number);
    return new Date(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1);
  }
  function fmtDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return String(iso || '日期未知');
    var d = parseISO(iso);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + WEEKDAYS[d.getDay()];
  }
  function daysTogether(fromISO) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromISO))) return 1;
    var start = parseISO(fromISO);
    var now = new Date();
    var a = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    var b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.max(1, Math.floor((b - a) / 86400000) + 1);
  }
  function relTime(iso) {
    var time = new Date(iso).getTime();
    if (!time) return '刚刚';
    var diff = Date.now() - time;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
    return String(iso).slice(0, 10);
  }
  function authorName(author) {
    return author === 'her' ? (state.meta.her || '猫扑') : (state.meta.me || '我');
  }
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2600);
  }
  function uid() {
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /* ---------------- 默认内容 ---------------- */
  function seedData() {
    var now = new Date().toISOString();
    return {
      meta: {
        me: '我',
        her: '猫扑',
        startDate: isoDate(-365),
        tagline: '把我们的小日子，都收进这个粉粉的小站'
      },
      records: [
        {
          id: 'seed-1',
          date: isoDate(-26),
          title: '第一次一起看电影',
          content: '她挑的文艺片，散场后路灯把影子拉得好长。\n她说今天的爆米花特别甜，我也这么觉得。',
          mood: '甜甜',
          weather: '晴',
          tags: ['约会', '电影'],
          author: 'me',
          images: [],
          pinned: true,
          createdAt: now,
          updatedAt: now,
          updatedBy: 'me'
        },
        {
          id: 'seed-2',
          date: isoDate(-7),
          title: '猫扑做的咖喱饭',
          content: '第一次吃她亲手做的咖喱饭，土豆切成小方块，米饭被捏成了心形。\n我把碗吃得干干净净，她说下次还要加两颗草莓。',
          mood: '开心',
          weather: '多云',
          tags: ['美食', '日常'],
          author: 'her',
          images: [],
          pinned: false,
          createdAt: now,
          updatedAt: now,
          updatedBy: 'her'
        }
      ]
    };
  }

  function normalizeData(raw) {
    var data = raw && typeof raw === 'object' ? raw : {};
    var meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
    return {
      meta: {
        me: String(meta.me || '').slice(0, 16) || '我',
        her: String(meta.her || '').slice(0, 16) || '猫扑',
        startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(meta.startDate)) ? meta.startDate : isoDate(-365),
        tagline: String(meta.tagline || '').slice(0, 60) || '把我们的小日子，都收进这个粉粉的小站'
      },
      records: (Array.isArray(data.records) ? data.records : []).filter(function (item) {
        return item && typeof item === 'object';
      }).map(function (item) {
        var now = new Date().toISOString();
        return {
          id: String(item.id || uid()),
          date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.date)) ? item.date : todayISO(),
          title: String(item.title || '没标题的小日子').slice(0, 60),
          content: String(item.content || '').slice(0, 4000),
          mood: String(item.mood || '').slice(0, 12),
          weather: String(item.weather || '').slice(0, 12),
          tags: (Array.isArray(item.tags) ? item.tags : []).map(function (tag) { return String(tag).slice(0, 16); }).filter(Boolean).slice(0, 8),
          author: item.author === 'her' ? 'her' : 'me',
          images: (Array.isArray(item.images) ? item.images : []).filter(function (src) {
            return typeof src === 'string' && /^(data:image\/|https?:\/\/)/i.test(src);
          }).slice(0, 3),
          pinned: !!item.pinned,
          createdAt: String(item.createdAt || now),
          updatedAt: String(item.updatedAt || now),
          updatedBy: item.updatedBy === 'her' ? 'her' : (item.updatedBy === 'me' ? 'me' : (item.author === 'her' ? 'her' : 'me'))
        };
      })
    };
  }

  /* ---------------- 数据读写（本地 / 服务端） ---------------- */
  function readLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function writeLocal(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      showToast('浏览器存不下了，删几张图或先导出备份吧');
      return false;
    }
  }


  /* ---------------- 云同步（GitHub Gist） ---------------- */
  function hasCloud() {
    return !!(cloudConfig && cloudConfig.gistId && cloudConfig.token);
  }

  function cloudHeaders() {
    return {
      Authorization: 'Bearer ' + cloudConfig.token,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
  }

  function cloudReadFile(raw) {
    var file = raw && raw.files ? raw.files['maopu-diary.json'] : null;
    if (!file) return Promise.reject(new Error('云端还没有数据文件'));
    if (file.truncated || file.size > 900000) {
      return fetch(file.raw_url, { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('读取云端大文件失败');
        return res.text();
      });
    }
    return Promise.resolve(file.content || '{}');
  }

  function cloudLoad() {
    return fetch('https://api.github.com/gists/' + encodeURIComponent(cloudConfig.gistId), {
      headers: cloudHeaders(),
      cache: 'no-store'
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) throw new Error('云同步令牌失效了');
      if (!res.ok) throw new Error('读取云端失败（' + res.status + '）');
      return res.json();
    }).then(function (raw) {
      return cloudReadFile(raw).then(function (text) {
        var payload;
        try { payload = JSON.parse(text || '{}'); }
        catch (err) { throw new Error('云端数据格式不对'); }
        return { payload: payload, updatedAt: raw.updated_at || '' };
      });
    });
  }

  function cloudSave(payload) {
    return fetch('https://api.github.com/gists/' + encodeURIComponent(cloudConfig.gistId), {
      method: 'PATCH',
      headers: cloudHeaders(),
      body: JSON.stringify({ files: { 'maopu-diary.json': { content: JSON.stringify(payload) } } })
    }).then(function (res) {
      if (!res.ok) throw new Error('写入云端失败（' + res.status + '）');
      return res.json();
    }).then(function (raw) {
      state.cloudUpdatedAt = raw.updated_at || '';
    });
  }

  function cloudInit() {
    return cloudLoad().then(function (result) {
      var data = normalizeData(result.payload);
      state.meta = data.meta;
      state.records = data.records;
      state.mode = 'cloud';
      state.cloudUpdatedAt = result.updatedAt;
      writeLocal({ meta: state.meta, records: state.records });
      startCloudPolling();
    }).catch(function (err) {
      state.mode = 'local';
      load();
      showToast('云同步没连上：' + err.message + '，先用本机模式');
    });
  }

  function startCloudPolling() {
    if (cloudTimer) clearInterval(cloudTimer);
    cloudTimer = setInterval(function () {
      if (state.mode !== 'cloud' || document.hidden) return;
      if (els.recordModal && !els.recordModal.hidden) return;
      if (els.metaModal && !els.metaModal.hidden) return;
      if (els.cloudModal && !els.cloudModal.hidden) return;
      cloudLoad().then(function (result) {
        if (!result.updatedAt || result.updatedAt === state.cloudUpdatedAt) return;
        var data = normalizeData(result.payload);
        state.meta = data.meta;
        state.records = data.records;
        state.cloudUpdatedAt = result.updatedAt;
        writeLocal({ meta: state.meta, records: state.records });
        renderAll();
        showToast('猫扑那边更新啦 💗');
      }).catch(function () {});
    }, 8000);
  }

  function load() {
    if (state.mode === 'cloud') {
      return cloudLoad().then(function (result) {
        var data = normalizeData(result.payload);
        state.meta = data.meta;
        state.records = data.records;
        state.cloudUpdatedAt = result.updatedAt;
      });
    }
    if (state.mode === 'server') {
      return fetch('api/data', { cache: 'no-store' }).then(function (response) {
        if (!response.ok) throw new Error('重新读取失败');
        return response.json();
      }).then(function (raw) {
        var fresh = normalizeData(raw);
        state.meta = fresh.meta;
        state.records = fresh.records;
      });
    }
    var stored = readLocal();
    var data = normalizeData(stored || seedData());
    if (!stored) writeLocal(data);
    state.meta = data.meta;
    state.records = data.records;
    return Promise.resolve();
  }

  function save() {
    var payload = { meta: state.meta, records: state.records };
    if (state.mode === 'cloud') {
      writeLocal(payload);
      return cloudSave(payload).catch(function (err) {
        showToast('云同步保存失败：' + err.message + '（已先存在本机）');
        throw err;
      });
    }
    if (state.mode === 'server') {
      return fetch('api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (response) {
        if (!response.ok) throw new Error('保存到小服务失败');
        return response.json();
      }).then(function (result) {
        if (result && result.data) {
          state.meta = normalizeData(result.data).meta;
          state.records = normalizeData(result.data).records;
        }
      }).catch(function (err) {
        showToast('保存失败：' + err.message);
        throw err;
      });
    }
    if (!writeLocal(payload)) throw new Error('本地存储写入失败');
    return Promise.resolve();
  }

  function detectMode() {
    if (hasCloud()) {
      return cloudInit();
    }
    if (window.MAOPU_OFFLINE) {
      state.mode = 'local';
      load();
      return Promise.resolve();
    }
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
      state.mode = 'local';
      load();
      return Promise.resolve();
    }
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 3000);
    return fetch('api/data', { cache: 'no-store', signal: controller ? controller.signal : undefined })
      .then(function (response) {
        clearTimeout(timer);
        if (!response.ok) throw new Error('no api');
        return response.json();
      })
      .then(function (raw) {
        var data = normalizeData(raw);
        if (!data.records.length) {
          var seeded = normalizeData(seedData());
          state.meta = seeded.meta;
          state.records = seeded.records;
          state.mode = 'server';
          return save();
        }
        state.meta = data.meta;
        state.records = data.records;
        state.mode = 'server';
      })
      .catch(function () {
        clearTimeout(timer);
        state.mode = 'local';
        load();
      });
  }

  /* ---------------- 渲染 ---------------- */
  function renderAll() {
    renderMeta();
    renderStats();
    renderFilters();
    renderGrid();
    els.year.textContent = String(new Date().getFullYear());
  }

  function renderMeta() {
    els.nameMe.textContent = state.meta.me || '我';
    els.nameHer.textContent = state.meta.her || '猫扑';
    els.tagline.textContent = state.meta.tagline || '把我们的小日子，都收进这个粉粉的小站';
    els.daysCount.textContent = String(daysTogether(state.meta.startDate));

    $all('#whoSwitch button').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-author') === state.author);
    });
    if (els.authorFilter.options.length >= 3) {
      els.authorFilter.options[1].textContent = (state.meta.me || '我') + ' 写的';
      els.authorFilter.options[2].textContent = (state.meta.her || '猫扑') + ' 写的';
    }
    els.modeBadge.hidden = false;
    if (state.mode === 'cloud') {
      els.modeBadge.textContent = '云同步 · 数据在 GitHub，你们打开同一个网址就能一起写';
    } else if (state.mode === 'server') {
      els.modeBadge.textContent = '共享模式 · 数据存在本机小服务里，你俩打开同一个地址就能一起编辑';
    } else if (window.MAOPU_OFFLINE) {
      els.modeBadge.textContent = '手机离线版 · 数据只存在这台手机的浏览器里，换手机前记得「导出备份」';
    } else {
      els.modeBadge.textContent = '本地模式 · 数据存在这个浏览器里，记得常用「导出备份」';
    }
  }

  function renderStats() {
    els.statTotal.textContent = String(state.records.length);
    var monthPrefix = todayISO().slice(0, 7);
    els.statMonth.textContent = String(state.records.filter(function (record) {
      return String(record.date).slice(0, 7) === monthPrefix;
    }).length);

    var latest = null;
    state.records.forEach(function (record) {
      if (!latest || String(record.updatedAt) > String(latest.updatedAt)) latest = record;
    });
    els.statUpdate.textContent = latest ? relTime(latest.updatedAt) : '还没有';
  }

  function fillSelect(select, placeholder, items) {
    var current = select.value;
    select.innerHTML = '';
    var first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    select.appendChild(first);
    items.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      select.appendChild(option);
    });
    var exists = Array.prototype.some.call(select.options, function (option) { return option.value === current; });
    select.value = exists ? current : '';
  }

  function renderFilters() {
    var months = [];
    var tags = [];
    state.records.forEach(function (record) {
      var month = String(record.date).slice(0, 7);
      if (month && months.indexOf(month) === -1) months.push(month);
      (record.tags || []).forEach(function (tag) {
        if (tags.indexOf(tag) === -1) tags.push(tag);
      });
    });
    months.sort().reverse();
    tags.sort(function (a, b) { return a.localeCompare(b, 'zh'); });

    fillSelect(els.monthFilter, '全部月份', months.map(function (month) {
      return { value: month, label: month.replace('-', ' 年 ') + ' 月' };
    }));
    fillSelect(els.tagFilter, '全部标签', tags.map(function (tag) {
      return { value: tag, label: '#' + tag };
    }));

    state.filters.month = els.monthFilter.value;
    state.filters.tag = els.tagFilter.value;
  }

  function visibleRecords() {
    var keyword = state.filters.keyword.trim().toLowerCase();
    return state.records.filter(function (record) {
      if (state.filters.month && String(record.date).slice(0, 7) !== state.filters.month) return false;
      if (state.filters.tag && (record.tags || []).indexOf(state.filters.tag) === -1) return false;
      if (state.filters.author && record.author !== state.filters.author) return false;
      if (keyword) {
        var haystack = [record.title, record.content, (record.tags || []).join(' '), record.mood, record.weather].join(' ').toLowerCase();
        if (haystack.indexOf(keyword) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      var byDate = String(b.date).localeCompare(String(a.date));
      if (byDate !== 0) return byDate;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  function chip(className, text) {
    var span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  function moodEmoji(mood) {
    var map = { '甜甜': '🍯', '开心': '😊', '心动': '💓', '平静': '🍃', '想念': '💭', '有点小别扭': '🥺', '元气满满': '✨' };
    return map[mood] || '💗';
  }
  function weatherEmoji(weather) {
    var map = { '晴': '☀️', '多云': '⛅', '小雨': '🌧️', '大雨': '⛈️', '雪': '❄️', '有风': '🍃' };
    return map[weather] || '🌈';
  }

  function buildCard(record, index) {
    var card = document.createElement('article');
    card.className = 'card' + (record.pinned ? ' pinned' : '');
    card.style.animationDelay = Math.min(index * 45, 450) + 'ms';

    var top = document.createElement('div');
    top.className = 'card-top';

    var date = document.createElement('span');
    date.className = 'date-chip';
    date.textContent = fmtDate(record.date);
    top.appendChild(date);

    var author = document.createElement('span');
    author.className = 'author-chip ' + (record.author === 'her' ? 'her' : 'me');
    author.textContent = (record.author === 'her' ? '🐱 ' : '🐾 ') + authorName(record.author);
    top.appendChild(author);

    if (record.pinned) {
      var pinChip = document.createElement('span');
      pinChip.className = 'pin-chip';
      pinChip.textContent = '📌 置顶';
      top.appendChild(pinChip);
    }
    card.appendChild(top);

    var title = document.createElement('h3');
    title.textContent = record.title || '没标题的小日子';
    card.appendChild(title);

    if (record.content) {
      var body = document.createElement('p');
      body.className = 'card-body';
      body.textContent = record.content;
      card.appendChild(body);
    }

    if (record.images && record.images.length) {
      var gallery = document.createElement('div');
      gallery.className = 'gallery' + (record.images.length === 1 ? ' single' : '');
      record.images.forEach(function (src) {
        var img = document.createElement('img');
        img.src = src;
        img.alt = record.title || '小日子配图';
        img.loading = 'lazy';
        img.addEventListener('click', function () { openLightbox(src); });
        gallery.appendChild(img);
      });
      card.appendChild(gallery);
    }

    var metaRow = document.createElement('div');
    metaRow.className = 'card-meta';
    if (record.mood) metaRow.appendChild(chip('mood-chip', moodEmoji(record.mood) + ' ' + record.mood));
    if (record.weather) metaRow.appendChild(chip('mood-chip', weatherEmoji(record.weather) + ' ' + record.weather));
    (record.tags || []).forEach(function (tag) { metaRow.appendChild(chip('tag', '#' + tag)); });
    if (metaRow.children.length) card.appendChild(metaRow);

    var foot = document.createElement('div');
    foot.className = 'card-foot';

    var updated = document.createElement('span');
    updated.className = 'updated';
    updated.textContent = '最后更新 ' + relTime(record.updatedAt) + ' · ' + authorName(record.updatedBy || record.author);
    foot.appendChild(updated);

    var actions = document.createElement('div');
    actions.className = 'card-actions';

    var pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.textContent = record.pinned ? '取消置顶' : '置顶';
    pinBtn.addEventListener('click', function () { togglePin(record); });
    actions.appendChild(pinBtn);

    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = '编辑';
    editBtn.addEventListener('click', function () { openRecordModal(record); });
    actions.appendChild(editBtn);

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', function () { removeRecord(record); });
    actions.appendChild(delBtn);

    foot.appendChild(actions);
    card.appendChild(foot);
    return card;
  }

  function renderGrid() {
    var list = visibleRecords();
    els.grid.innerHTML = '';
    list.forEach(function (record, index) {
      els.grid.appendChild(buildCard(record, index));
    });
    els.emptyState.hidden = list.length > 0;
    if (!list.length) {
      var hasRecords = state.records.length > 0;
      els.emptyState.querySelector('h3').textContent = hasRecords ? '没有找到符合筛选的小日子' : '这里还空空的';
      els.emptyState.querySelector('p').textContent = hasRecords
        ? '换个关键词，或者把筛选清空试试～'
        : '点右上角的「＋ 写一条」，把今天的小事记下来吧～';
    }
  }

  /* ---------------- 弹窗 ---------------- */
  function openModal(node) {
    node.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal(node) {
    node.hidden = true;
    document.body.style.overflow = '';
  }

  function openRecordModal(record) {
    state.editingImages = record && Array.isArray(record.images) ? record.images.slice(0, 3) : [];
    els.modalTitle.textContent = record ? '编辑这条小日子' : '写一条小日子';
    els.recordId.value = record ? record.id : '';
    els.fieldDate.value = record ? record.date : todayISO();
    els.fieldAuthor.value = record ? record.author : state.author;
    els.fieldTitle.value = record ? record.title : '';
    els.fieldContent.value = record ? record.content : '';
    els.fieldMood.value = record ? record.mood || '' : '';
    els.fieldWeather.value = record ? record.weather || '' : '';
    els.fieldTags.value = record && Array.isArray(record.tags) ? record.tags.join(', ') : '';
    els.fieldPinned.checked = !!(record && record.pinned);
    els.deleteBtn.hidden = !record;
    els.fieldImages.value = '';
    renderImagePreview();
    openModal(els.recordModal);
    setTimeout(function () { els.fieldTitle.focus(); }, 60);
  }

  function renderImagePreview() {
    els.imagePreview.innerHTML = '';
    state.editingImages.forEach(function (src, index) {
      var wrap = document.createElement('div');
      wrap.className = 'thumb';
      var img = document.createElement('img');
      img.src = src;
      img.alt = '配图 ' + (index + 1);
      wrap.appendChild(img);
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.title = '移除这张';
      remove.textContent = '✕';
      remove.addEventListener('click', function () {
        state.editingImages.splice(index, 1);
        renderImagePreview();
      });
      wrap.appendChild(remove);
      els.imagePreview.appendChild(wrap);
    });
  }

  function openMetaModal() {
    els.metaMe.value = state.meta.me || '';
    els.metaHer.value = state.meta.her || '';
    els.metaStart.value = state.meta.startDate || todayISO();
    els.metaTagline.value = state.meta.tagline || '';
    openModal(els.metaModal);
    setTimeout(function () { els.metaMe.focus(); }, 60);
  }


  /* ---------------- 云同步设置弹窗 ---------------- */
  function applyCloudHash() {
    var match = /[#&]cloud=([A-Za-z0-9_\-]+)/.exec(location.hash || '');
    if (!match) return;
    try {
      var base = match[1].replace(/-/g, '+').replace(/_/g, '/');
      var cfg = JSON.parse(atob(base));
      if (cfg && cfg.gistId && cfg.token) {
        writeCloudConfig(cfg);
        cloudConfig = cfg;
      }
    } catch (err) { /* 忽略坏链接 */ }
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
  }

  function openCloudModal() {
    var cfg = cloudConfig || readCloudConfig();
    els.cloudGist.value = cfg ? cfg.gistId : '';
    els.cloudToken.value = cfg ? cfg.token : '';
    els.cloudStatus.textContent = state.mode === 'cloud' ? '已连接，正在同步' : '未连接';
    els.cloudDisconnect.hidden = !cloudConfig;
    els.cloudShare.hidden = !(state.mode === 'cloud' && cloudConfig);
    openModal(els.cloudModal);
    setTimeout(function () { els.cloudGist.focus(); }, 60);
  }

  function connectCloud() {
    var gistId = els.cloudGist.value.trim();
    var token = els.cloudToken.value.trim();
    if (!gistId || !token) {
      els.cloudStatus.textContent = 'Gist 编号和令牌都要填哦';
      return;
    }
    var cfg = { gistId: gistId, token: token };
    cloudConfig = cfg;
    els.cloudStatus.textContent = '正在连接…';
    cloudLoad().then(function (result) {
      writeCloudConfig(cfg);
      var data = normalizeData(result.payload);
      state.meta = data.meta;
      state.records = data.records;
      state.mode = 'cloud';
      state.cloudUpdatedAt = result.updatedAt;
      writeLocal({ meta: state.meta, records: state.records });
      startCloudPolling();
      renderAll();
      els.cloudDisconnect.hidden = false;
      els.cloudShare.hidden = false;
      els.cloudStatus.textContent = '连接成功，数据已经同步';
      showToast('云同步连接成功 ☁️');
    }).catch(function (err) {
      cloudConfig = null;
      els.cloudStatus.textContent = '连接失败：' + err.message;
    });
  }

  function disconnectCloud() {
    try { localStorage.removeItem(CLOUD_CONFIG_KEY); } catch (err) { /* ignore */ }
    cloudConfig = null;
    if (cloudTimer) { clearInterval(cloudTimer); cloudTimer = null; }
    state.mode = 'local';
    load();
    renderAll();
    els.cloudStatus.textContent = '已断开，数据保留在本机';
    els.cloudShare.hidden = true;
    els.cloudDisconnect.hidden = true;
    showToast('已断开云同步');
  }

  function shareCloudLink() {
    if (!cloudConfig) return;
    var base = btoa(JSON.stringify(cloudConfig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    var url = location.origin + location.pathname + '#cloud=' + base;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showToast('手机连接已复制，发给猫扑打开就能用');
      }).catch(function () {
        window.prompt('复制这个链接发给猫扑：', url);
      });
    } else {
      window.prompt('复制这个链接发给猫扑：', url);
    }
  }

  /* ---------------- 增删改 ---------------- */
  function upsert(recordId, payload) {
    var now = new Date().toISOString();
    if (recordId) {
      var index = -1;
      state.records.forEach(function (item, i) { if (item.id === recordId) index = i; });
      if (index === -1) throw new Error('这条记录找不到了，可能已经被删掉');
      var base = state.records[index];
      state.records[index] = Object.assign({}, base, payload, {
        id: base.id,
        createdAt: base.createdAt,
        updatedAt: now,
        updatedBy: state.author
      });
    } else {
      state.records.push(Object.assign({}, payload, {
        id: uid(),
        createdAt: now,
        updatedAt: now,
        updatedBy: state.author
      }));
    }
    return save().catch(function (err) {
      return load().catch(function () {}).then(function () {
        renderAll();
        throw err;
      });
    });
  }

  function togglePin(record) {
    var target = null;
    state.records.forEach(function (item) {
      if (item.id === record.id) {
        item.pinned = !item.pinned;
        item.updatedAt = new Date().toISOString();
        item.updatedBy = state.author;
        target = item;
      }
    });
    if (!target) return;
    save().then(function () {
      showToast(target.pinned ? '已经置顶啦 ⭐' : '取消置顶了');
      renderAll();
    }).catch(function () { load().catch(function () {}).then(renderAll); });
  }

  function removeRecord(record) {
    if (!window.confirm('确定要删除「' + (record.title || '这条记录') + '」吗？删除之后就找不回来了。')) return;
    state.records = state.records.filter(function (item) { return item.id !== record.id; });
    save().then(function () {
      showToast('已经删掉了');
      renderAll();
    }).catch(function () { load().catch(function () {}).then(renderAll); });
  }

  /* ---------------- 图片处理 ---------------- */
  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || '');
        compressImage(dataUrl).then(resolve).catch(function () { resolve(dataUrl); });
      };
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.readAsDataURL(file);
    });
  }

  function compressImage(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var width = img.naturalWidth || img.width;
        var height = img.naturalHeight || img.height;
        if (!width || !height) { resolve(dataUrl); return; }
        var scale = Math.min(1, IMG_MAX / Math.max(width, height));
        var w = Math.round(width * scale);
        var h = Math.round(height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', IMG_QUALITY));
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  /* ---------------- 大图 ---------------- */
  var lightbox = null;
  function openLightbox(src) {
    closeLightbox();
    lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    var img = document.createElement('img');
    img.src = src;
    img.alt = '大图预览';
    lightbox.appendChild(img);
    lightbox.addEventListener('click', closeLightbox);
    document.body.appendChild(lightbox);
  }
  function closeLightbox() {
    if (lightbox) {
      lightbox.remove();
      lightbox = null;
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    els.newBtn.addEventListener('click', function () { openRecordModal(null); });
    els.metaBtn.addEventListener('click', openMetaModal);
    els.cloudBtn.addEventListener('click', openCloudModal);
    els.cloudForm.addEventListener('submit', function (event) {
      event.preventDefault();
      connectCloud();
    });
    els.cloudDisconnect.addEventListener('click', disconnectCloud);
    els.cloudShare.addEventListener('click', shareCloudLink);

    els.whoSwitch.addEventListener('click', function (event) {
      var btn = event.target.closest('button[data-author]');
      if (!btn) return;
      state.author = btn.getAttribute('data-author') === 'her' ? 'her' : 'me';
      localStorage.setItem('maopu.author', state.author);
      renderMeta();
      showToast('现在以「' + authorName(state.author) + '」的身份记录');
    });

    els.searchInput.addEventListener('input', function () {
      state.filters.keyword = els.searchInput.value;
      renderGrid();
    });
    els.monthFilter.addEventListener('change', function () {
      state.filters.month = els.monthFilter.value;
      renderGrid();
    });
    els.tagFilter.addEventListener('change', function () {
      state.filters.tag = els.tagFilter.value;
      renderGrid();
    });
    els.authorFilter.addEventListener('change', function () {
      state.filters.author = els.authorFilter.value;
      renderGrid();
    });

    els.recordForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var id = els.recordId.value;
      var title = els.fieldTitle.value.trim();
      if (!title) {
        showToast('先起个标题吧');
        els.fieldTitle.focus();
        return;
      }
      var payload = {
        date: els.fieldDate.value || todayISO(),
        author: els.fieldAuthor.value === 'her' ? 'her' : 'me',
        title: title,
        content: els.fieldContent.value.trim(),
        mood: els.fieldMood.value,
        weather: els.fieldWeather.value,
        tags: els.fieldTags.value.split(/[,，、\s]+/).map(function (tag) {
          return tag.replace(/^#/, '').trim();
        }).filter(Boolean).slice(0, 8),
        pinned: els.fieldPinned.checked,
        images: state.editingImages.slice(0, 3)
      };
      upsert(id || null, payload).then(function () {
        closeModal(els.recordModal);
        showToast(id ? '改好啦 💗' : '记下来啦 💗');
        renderAll();
      }).catch(function (err) {
        showToast('保存失败：' + err.message);
      });
    });

    els.deleteBtn.addEventListener('click', function () {
      var id = els.recordId.value;
      var record = null;
      state.records.forEach(function (item) { if (item.id === id) record = item; });
      if (!record) return;
      if (!window.confirm('确定要删除「' + (record.title || '这条记录') + '」吗？')) return;
      state.records = state.records.filter(function (item) { return item.id !== record.id; });
      save().then(function () {
        closeModal(els.recordModal);
        showToast('已经删掉了');
        renderAll();
      }).catch(function () { load().catch(function () {}).then(renderAll); });
    });

    els.fieldImages.addEventListener('change', function () {
      var files = Array.prototype.slice.call(els.fieldImages.files || []);
      if (!files.length) return;
      var room = 3 - state.editingImages.length;
      if (room <= 0) {
        showToast('最多放 3 张图哦');
        els.fieldImages.value = '';
        return;
      }
      var chosen = files.slice(0, room);
      if (files.length > room) showToast('最多 3 张，先放前 ' + room + ' 张');
      showToast('正在压缩图片…');
      var chain = Promise.resolve();
      chosen.forEach(function (file) {
        chain = chain.then(function () {
          return fileToDataUrl(file).then(function (dataUrl) {
            if (dataUrl) state.editingImages.push(dataUrl);
          }).catch(function () {
            showToast('这张图读不出来：' + file.name);
          });
        });
      });
      chain.then(function () {
        renderImagePreview();
        els.fieldImages.value = '';
      });
    });

    els.metaForm.addEventListener('submit', function (event) {
      event.preventDefault();
      state.meta = {
        me: els.metaMe.value.trim() || '我',
        her: els.metaHer.value.trim() || '猫扑',
        startDate: els.metaStart.value || todayISO(),
        tagline: els.metaTagline.value.trim() || '把我们的小日子，都收进这个粉粉的小站'
      };
      save().then(function () {
        closeModal(els.metaModal);
        showToast('设置保存好啦');
        renderAll();
      }).catch(function () { load().catch(function () {}).then(renderAll); });
    });

    els.exportBtn.addEventListener('click', function () {
      var payload = { app: 'maopu-diary', exportedAt: new Date().toISOString(), meta: state.meta, records: state.records };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = '猫扑小日子备份-' + todayISO() + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
      showToast('备份文件开始下载啦 💾');
    });

    els.importBtn.addEventListener('click', function () { els.importInput.click(); });
    els.importInput.addEventListener('change', function () {
      var file = els.importInput.files && els.importInput.files[0];
      if (!file) return;
      file.text().then(function (text) {
        var parsed = JSON.parse(text);
        var data = normalizeData(parsed.data || parsed);
        if (!data.records.length) throw new Error('备份里没有找到记录');
        if (!window.confirm('用备份覆盖现在的 ' + state.records.length + ' 条记录？\n备份里一共 ' + data.records.length + ' 条。')) return;
        state.meta = data.meta;
        state.records = data.records;
        return save().then(function () {
          showToast('导入成功，共 ' + state.records.length + ' 条');
          renderAll();
        });
      }).catch(function (err) {
        showToast('导入失败：' + err.message);
      }).finally(function () {
        els.importInput.value = '';
      });
    });

    $all('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = document.getElementById(btn.getAttribute('data-close'));
        if (target) closeModal(target);
      });
    });
    [els.recordModal, els.metaModal].forEach(function (mask) {
      mask.addEventListener('click', function (event) {
        if (event.target === mask) closeModal(mask);
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeModal(els.recordModal);
        closeModal(els.metaModal);
        closeLightbox();
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function cacheEls() {
    els = {
      nameMe: $('#nameMe'),
      nameHer: $('#nameHer'),
      tagline: $('#tagline'),
      daysCount: $('#daysCount'),
      modeBadge: $('#modeBadge'),
      statTotal: $('#statTotal'),
      statMonth: $('#statMonth'),
      statUpdate: $('#statUpdate'),
      whoSwitch: $('#whoSwitch'),
      searchInput: $('#searchInput'),
      monthFilter: $('#monthFilter'),
      tagFilter: $('#tagFilter'),
      authorFilter: $('#authorFilter'),
      grid: $('#grid'),
      emptyState: $('#emptyState'),
      year: $('#year'),
      metaBtn: $('#metaBtn'),
      newBtn: $('#newBtn'),
      exportBtn: $('#exportBtn'),
      importBtn: $('#importBtn'),
      importInput: $('#importInput'),
      recordModal: $('#recordModal'),
      modalTitle: $('#modalTitle'),
      recordForm: $('#recordForm'),
      recordId: $('#recordId'),
      fieldDate: $('#fieldDate'),
      fieldAuthor: $('#fieldAuthor'),
      fieldTitle: $('#fieldTitle'),
      fieldContent: $('#fieldContent'),
      fieldMood: $('#fieldMood'),
      fieldWeather: $('#fieldWeather'),
      fieldTags: $('#fieldTags'),
      fieldImages: $('#fieldImages'),
      imagePreview: $('#imagePreview'),
      fieldPinned: $('#fieldPinned'),
      deleteBtn: $('#deleteBtn'),
      metaModal: $('#metaModal'),
      metaForm: $('#metaForm'),
      metaMe: $('#metaMe'),
      metaHer: $('#metaHer'),
      metaStart: $('#metaStart'),
      metaTagline: $('#metaTagline'),
      cloudBtn: $('#cloudBtn'),
      cloudModal: $('#cloudModal'),
      cloudForm: $('#cloudForm'),
      cloudGist: $('#cloudGist'),
      cloudToken: $('#cloudToken'),
      cloudStatus: $('#cloudStatus'),
      cloudDisconnect: $('#cloudDisconnect'),
      cloudShare: $('#cloudShare'),
      toast: $('#toast')
    };
  }

  function init() {
    applyCloudHash();
    if (typeof window !== 'undefined' && window.location && /(?:^|[?&])nomotion=1/.test(window.location.search)) {
      document.documentElement.classList.add('no-motion');
    }
    cacheEls();
    bind();
    els.fieldDate.value = todayISO();
    detectMode().then(function () {
      renderAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());