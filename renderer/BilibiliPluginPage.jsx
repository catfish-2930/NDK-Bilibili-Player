import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import './BilibiliPluginPage.css'

function BilibiliPluginPage({ onEnqueueMedia, onShowToast, KeyboardComponent }) {
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('请输入关键词搜索 Bilibili 视频。')
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  const load = async (nextQuery, nextPage = 1) => {
    const keyword = String(nextQuery || '').trim()
    if (!keyword) { setVideos([]); setMessage('请输入关键词搜索 Bilibili 视频。'); return }
    setLoading(true); setMessage('')
    try {
      const result = await window.api.plugins.invoke('plugin:bilibili-player:search', { query: keyword, page: nextPage })
      if (!result?.ok) throw new Error(result?.error || 'Bilibili search failed.')
      setVideos(Array.isArray(result.videos) ? result.videos : [])
      setPage(Number(result.page || nextPage)); setTotalPages(Math.max(1, Number(result.totalPages || 1))); setHasNext(Boolean(result.hasNext))
      if (!result.videos?.length) setMessage('没有找到视频。')
    } catch (error) { setVideos([]); setMessage(error.message || 'Bilibili search failed.') } finally { setLoading(false) }
  }

  const enqueue = async (video) => {
    try {
      const result = await window.api.plugins.invoke('plugin:bilibili-player:queue', video)
      if (!result?.ok) throw new Error(result?.error || '无法加入队列。')
      const queued = await onEnqueueMedia(result.mediaItem)
      if (!queued?.ok) throw new Error(queued?.error || '无法加入队列。')
      onShowToast?.(`${video.title} 已加入队列。`)
    } catch (error) { setMessage(error.message || '无法加入队列。') }
  }

  useEffect(() => () => {}, [])
  const onKey = (key) => setQuery((value) => key === 'BACKSPACE' ? value.slice(0, -1) : key === 'CLEAR' ? '' : key === 'SPACE' ? `${value} ` : `${value}${key}`)
  return <section className="bilibili-plugin-page">
    <div className="bilibili-plugin-title">Bilibili</div>
    <div className="bilibili-video-grid">
      {videos.map((video) => <button className="bilibili-video-card" type="button" key={video.id} onClick={() => enqueue(video)}>
        <div className="bilibili-video-thumb">{video.thumbnail && <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />}{video.isMusic && <span>MUSIC</span>}</div>
        <div className="bilibili-video-name">{video.title}</div><div className="bilibili-video-artist">{video.artist || '-'}</div>
      </button>)}
      {(loading || message) && <div className="bilibili-state">{loading ? 'Loading...' : message}</div>}
    </div>
    <div className="bilibili-footer"><div className="bilibili-search-wrap"><input value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => setKeyboardOpen(true)} onClick={() => setKeyboardOpen(true)} onKeyDown={(e) => e.key === 'Enter' && load(query)} inputMode="none" placeholder="请输入关键词搜索 Bilibili" /><button type="button" onClick={() => load(query)}><Search size={28} /></button></div>
      <div className="bilibili-pagination"><button type="button" disabled={loading || page <= 1} onClick={() => load(query, page - 1)}><ChevronLeft />上一页</button><span>{page} / {totalPages}</span><button type="button" disabled={loading || !hasNext} onClick={() => load(query, page + 1)}>下一页<ChevronRight /></button></div></div>
    {KeyboardComponent && <KeyboardComponent visible={keyboardOpen} onKey={onKey} onText={(text) => setQuery((value) => `${value}${text || ''}`)} onConfirm={() => { setKeyboardOpen(false); load(query) }} displayValue={query} />}
  </section>
}

BilibiliPluginPage.propTypes = { onEnqueueMedia: PropTypes.func.isRequired, onShowToast: PropTypes.func, KeyboardComponent: PropTypes.elementType }
export default BilibiliPluginPage
