import crypto from 'crypto'
import https from 'https'

let registered = false
const state = (globalThis.__karaokeBilibiliPlayerState ||= { wbi: null })
const MIXIN_KEY_ENC_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]
const WBI_TTL_MS = 30 * 60 * 1000

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'user-agent': 'Mozilla/5.0',
        referer: 'https://www.bilibili.com/'
      }
    }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`Bilibili search failed (${response.statusCode}).`))
        try { resolve(JSON.parse(body)) } catch { reject(new Error('Bilibili returned invalid JSON.')) }
      })
    })
    request.setTimeout(10000, () => request.destroy(new Error('Bilibili search timed out.')))
    request.on('error', reject)
  })
}

function getMixinKey(imgUrl, subUrl) {
  const source = imgUrl.split('/').pop().split('.')[0] + subUrl.split('/').pop().split('.')[0]
  return MIXIN_KEY_ENC_TAB.map((index) => source[index]).join('').slice(0, 32)
}

async function getWbiKey() {
  if (state.wbi && Date.now() - state.wbi.createdAt < WBI_TTL_MS) return state.wbi.key
  const nav = await fetchJson('https://api.bilibili.com/x/web-interface/nav')
  const imageUrl = nav.data?.wbi_img?.img_url
  const subUrl = nav.data?.wbi_img?.sub_url
  if (!imageUrl || !subUrl) throw new Error('Unable to obtain Bilibili search credentials.')
  state.wbi = { key: getMixinKey(imageUrl, subUrl), createdAt: Date.now() }
  return state.wbi.key
}

function signedQuery(params, key) {
  const values = { ...params, wts: Math.floor(Date.now() / 1000) }
  const query = Object.keys(values).sort().map((name) => {
    const value = String(values[name]).replace(/[!'()*]/g, '')
    return `${encodeURIComponent(name)}=${encodeURIComponent(value)}`
  }).join('&')
  return `${query}&w_rid=${crypto.createHash('md5').update(query + key).digest('hex')}`
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim()
}

function toVideo(item) {
  const bvid = String(item.bvid || '')
  return {
    id: bvid,
    title: stripHtml(item.title) || bvid,
    artist: stripHtml(item.author) || '',
    thumbnail: item.pic ? String(item.pic).replace(/^\/\//, 'https://').replace(/^http:/, 'https:') : '',
    webpageUrl: bvid ? `https://www.bilibili.com/video/${bvid}` : '',
    duration: String(item.duration || ''),
    playCount: Number(item.play || 0),
    isLive: false,
    isMusic: /音乐|music/i.test(`${item.tname || ''} ${item.typename || ''}`)
  }
}

async function search(query, page) {
  const keyword = String(query || '').trim()
  if (!keyword) return { ok: true, videos: [], page: 1, pageSize: 10, totalPages: 1, hasPrev: false, hasNext: false }
  const currentPage = Math.max(1, Math.trunc(Number(page) || 1))
  const key = await getWbiKey()
  const requestUrl = `https://api.bilibili.com/x/web-interface/wbi/search/type?${signedQuery({ search_type: 'video', keyword, page: currentPage, page_size: 10 }, key)}`
  let response = await fetchJson(requestUrl)
  if (response.code === -403) {
    state.wbi = null
    const retryKey = await getWbiKey()
    response = await fetchJson(`https://api.bilibili.com/x/web-interface/wbi/search/type?${signedQuery({ search_type: 'video', keyword, page: currentPage, page_size: 10 }, retryKey)}`)
  }
  if (response.code !== 0) throw new Error(response.message || 'Bilibili search failed.')
  const pageInfo = response.data?.page || {}
  const rawTotalPages = Number(
    pageInfo.numPages || pageInfo.num_pages || response.data?.numPages || response.data?.num_pages || 0
  )
  // Bili occasionally omits its total page field for anonymous clients. The
  // list still honors `page`, so keep Next available while it returns a full page.
  const videos = (response.data?.result || []).map(toVideo).filter((video) => video.id && video.webpageUrl)
  const hasNext = rawTotalPages > 0 ? currentPage < rawTotalPages : videos.length >= 10
  const totalPages = rawTotalPages > 0 ? Math.max(1, rawTotalPages) : hasNext ? currentPage + 1 : currentPage
  return {
    ok: true,
    videos,
    page: currentPage,
    pageSize: 10,
    totalPages,
    hasPrev: currentPage > 1,
    hasNext
  }
}

export function register({ ipcMain, plugin, getConfig, channelPrefix }) {
  if (registered) return
  registered = true
  for (const action of ['recommend', 'search', 'queue']) ipcMain.removeHandler(`${channelPrefix}:${action}`)

  ipcMain.handle(`${channelPrefix}:recommend`, async (_event, payload) => {
    try { return await search(getConfig().recommendationQuery, payload?.page) } catch (error) { return { ok: false, error: error.message } }
  })
  ipcMain.handle(`${channelPrefix}:search`, async (_event, payload) => {
    try { return await search(payload?.query, payload?.page) } catch (error) { return { ok: false, error: error.message } }
  })
  ipcMain.handle(`${channelPrefix}:queue`, async (_event, video) => {
    const id = String(video?.id || '').trim()
    const webpageUrl = String(video?.webpageUrl || '').trim()
    if (!id || !/^https:\/\/www\.bilibili\.com\/video\/BV/i.test(webpageUrl)) return { ok: false, error: 'Invalid Bilibili video.' }
    return {
      ok: true,
      mediaItem: {
        title: String(video.title || id), artist: String(video.artist || ''), path: webpageUrl,
        thumbnail: String(video.thumbnail || ''), sourcePluginId: plugin.id, externalId: id,
        mediaSource: { backend: 'libmpv-bilibili', webpageUrl, title: String(video.title || id), thumbnail: String(video.thumbnail || '') }
      }
    }
  })
}
