(function () {
  function safeGet(key) {
    try {
      return localStorage.getItem(key)
    } catch (e) {
      return null
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      // ignore
    }
  }

  function initLocalLike(container, btn, countEl, likeId) {
    const key = 'hexo-like:' + likeId
    const countKey = key + ':count'

    let liked = safeGet(key) === '1'
    let count = parseInt(safeGet(countKey) || '0', 10)
    if (Number.isNaN(count)) count = 0

    const render = () => {
      btn.classList.toggle('is-liked', liked)
      btn.setAttribute('aria-pressed', liked ? 'true' : 'false')
      if (countEl) countEl.textContent = String(count)
    }

    btn.addEventListener('click', () => {
      liked = !liked
      count = Math.max(0, count + (liked ? 1 : -1))
      safeSet(key, liked ? '1' : '0')
      safeSet(countKey, String(count))
      render()
    })

    render()
  }

  function initLeanCloudLike(container, btn, countEl, likeId, title, cfg) {
    const appId = cfg.appId
    const appKey = cfg.appKey
    const serverURL = cfg.serverURL
    const className = cfg.className || 'PostLike'

    if (!appId || !appKey || !window.AV) {
      // fallback to local if missing config or SDK
      initLocalLike(container, btn, countEl, likeId)
      return
    }

    if (!window.__likeAvInited) {
      window.__likeAvInited = true
      window.AV.init({ appId: appId, appKey: appKey, serverURL: serverURL })
    }

    const key = 'hexo-like:' + likeId
    let liked = safeGet(key) === '1'
    let count = 0
    let likeObj = null

    const render = () => {
      btn.classList.toggle('is-liked', liked)
      btn.setAttribute('aria-pressed', liked ? 'true' : 'false')
      if (countEl) countEl.textContent = String(count)
    }

    const Like = window.AV.Object.extend(className)
    const query = new window.AV.Query(Like)
    query.equalTo('url', likeId)
    query.first().then(obj => {
      if (obj) {
        likeObj = obj
        count = obj.get('count') || 0
      } else {
        count = 0
      }
      render()
    }).catch(() => {
      render()
    })

    btn.addEventListener('click', async () => {
      if (liked) return
      liked = true
      count = count + 1
      safeSet(key, '1')
      render()

      try {
        if (!likeObj) {
          likeObj = new Like()
          likeObj.set('url', likeId)
          likeObj.set('title', title || likeId)
          likeObj.set('count', 1)
        } else {
          likeObj.increment('count', 1)
        }
        await likeObj.save()
        const savedCount = likeObj.get('count')
        if (typeof savedCount === 'number') {
          count = savedCount
          render()
        }
      } catch (e) {
        // ignore network errors
      }
    })

    render()
  }

  function buildEndpoint(endpoint, likeId, title) {
    if (!endpoint) return null
    let base = endpoint
    if (!/^https?:\/\//i.test(endpoint)) {
      base = new URL(endpoint, window.location.origin).toString()
    }
    const url = new URL(base)
    url.searchParams.set('url', likeId)
    if (title) url.searchParams.set('title', title)
    return url.toString()
  }

  function initWorkerLike(container, btn, countEl, likeId, title, cfg) {
    const endpoint = cfg.endpoint
    if (!endpoint || !window.fetch) {
      initLocalLike(container, btn, countEl, likeId)
      return
    }

    const token = cfg.token
    const key = 'hexo-like:' + likeId
    let liked = safeGet(key) === '1'
    let count = 0

    const render = () => {
      btn.classList.toggle('is-liked', liked)
      btn.setAttribute('aria-pressed', liked ? 'true' : 'false')
      if (countEl) countEl.textContent = String(count)
    }

    const getUrl = buildEndpoint(endpoint, likeId, title)
    if (!getUrl) {
      initLocalLike(container, btn, countEl, likeId)
      return
    }

    const fetchCount = async () => {
      try {
        const res = await fetch(getUrl, {
          method: 'GET',
          headers: token ? { 'X-Like-Token': token } : {}
        })
        const data = await res.json()
        if (typeof data.count === 'number') {
          count = data.count
          render()
        }
      } catch (e) {
        render()
      }
    }

    btn.addEventListener('click', async () => {
      if (liked) return
      liked = true
      count = count + 1
      safeSet(key, '1')
      render()
      try {
        const res = await fetch(getUrl, {
          method: 'POST',
          headers: token ? { 'X-Like-Token': token } : {}
        })
        const data = await res.json()
        if (typeof data.count === 'number') {
          count = data.count
          render()
        }
      } catch (e) {
        // ignore
      }
    })

    render()
    fetchCount()
  }

  function initPostLike() {
    const container = document.querySelector('.post-like')
    if (!container) return

    const btn = container.querySelector('.post-like__btn')
    if (!btn || btn.dataset.bound === '1') return
    btn.dataset.bound = '1'

    const countEl = container.querySelector('.post-like__count')
    const likeId = container.getAttribute('data-like-id') || window.location.pathname
    const title = container.getAttribute('data-like-title') || document.title
    const provider = container.getAttribute('data-like-provider') || 'local'
    const cfg = {
      appId: container.getAttribute('data-like-app-id') || '',
      appKey: container.getAttribute('data-like-app-key') || '',
      serverURL: container.getAttribute('data-like-server-url') || '',
      className: container.getAttribute('data-like-class-name') || 'PostLike',
      endpoint: container.getAttribute('data-like-endpoint') || '',
      token: container.getAttribute('data-like-token') || ''
    }

    if (provider === 'leancloud') {
      initLeanCloudLike(container, btn, countEl, likeId, title, cfg)
    } else if (provider === 'worker' || provider === 'cloudflare') {
      initWorkerLike(container, btn, countEl, likeId, title, cfg)
    } else {
      initLocalLike(container, btn, countEl, likeId)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPostLike)
  } else {
    initPostLike()
  }

  document.addEventListener('pjax:complete', initPostLike)
})()
