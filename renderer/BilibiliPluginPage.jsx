import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import './BilibiliPluginPage.css'

function BilibiliIcon() {
  return (
    <svg className="bilibili-brand-icon" viewBox="0 0 36 32" aria-hidden="true">
      <path
        d="M10 7 7 3M26 7l3-4M7 8h22a4 4 0 0 1 4 4v11a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V12a4 4 0 0 1 4-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 17h.01M24 17h.01M12 23c3.5 2 8.5 2 12 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BilibiliPluginPage({ onEnqueueMedia, onShowToast, KeyboardComponent }) {
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [partLoadingId, setPartLoadingId] = useState('')
  const [message, setMessage] = useState('请输入关键词搜索 Bilibili 视频。')
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [partPicker, setPartPicker] = useState(null)
  const [queueingAllParts, setQueueingAllParts] = useState(false)

  const load = async (nextQuery, nextPage = 1) => {
    const keyword = String(nextQuery || '').trim()
    if (!keyword) {
      setVideos([])
      setMessage('请输入关键词搜索 Bilibili 视频。')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const result = await window.api.plugins.invoke('plugin:bilibili-player:search', {
        query: keyword,
        page: nextPage
      })
      if (!result?.ok) throw new Error(result?.error || 'Bilibili search failed.')
      if (nextPage > 1 && !result.videos?.length) {
        setHasNext(false)
        setTotalPages(page)
        setMessage('已到最后一页。')
        return
      }
      setVideos(Array.isArray(result.videos) ? result.videos : [])
      setPage(Number(result.page || nextPage))
      setTotalPages(result.totalPages ? Math.max(1, Number(result.totalPages)) : null)
      setHasNext(Boolean(result.hasNext))
      if (!result.videos?.length) setMessage('没有找到视频。')
    } catch (error) {
      setVideos([])
      setMessage(error.message || 'Bilibili search failed.')
    } finally {
      setLoading(false)
    }
  }

  const loadRecommendation = async () => {
    setLoading(true)
    setMessage('')
    try {
      const result = await window.api.plugins.invoke('plugin:bilibili-player:recommend', {
        page: 1
      })
      if (!result?.ok) throw new Error(result?.error || 'Bilibili recommendation failed.')
      setQuery(String(result.query || ''))
      setVideos(Array.isArray(result.videos) ? result.videos : [])
      setPage(Number(result.page || 1))
      setTotalPages(result.totalPages ? Math.max(1, Number(result.totalPages)) : null)
      setHasNext(Boolean(result.hasNext))
      if (!result.videos?.length) setMessage('No videos found.')
    } catch (error) {
      setVideos([])
      setMessage(error.message || 'Bilibili recommendation failed.')
    } finally {
      setLoading(false)
    }
  }

  const enqueue = async (video) => {
    try {
      const result = await window.api.plugins.invoke('plugin:bilibili-player:queue', video)
      if (!result?.ok) throw new Error(result?.error || '无法加入队列。')
      const queued = await onEnqueueMedia(result.mediaItem)
      if (!queued?.ok) throw new Error(queued?.error || '无法加入队列。')
      onShowToast?.(`${video.title} 已加入队列。`)
      return true
    } catch (error) {
      setMessage(error.message || '无法加入队列。')
      return false
    }
  }

  const selectVideo = async (video) => {
    try {
      setPartLoadingId(video.id)
      const result = await window.api.plugins.invoke('plugin:bilibili-player:pages', video)
      if (!result?.ok) throw new Error(result?.error || 'Unable to read Bilibili video parts.')
      const pages = Array.isArray(result.pages) ? result.pages : []
      if (pages.length > 1) setPartPicker({ video, pages })
      else await enqueue({ ...video, page: pages[0]?.page || 1 })
    } catch (error) {
      setMessage(error.message || 'Unable to read Bilibili video parts.')
    } finally {
      setPartLoadingId('')
    }
  }

  const selectPart = async (part) => {
    const picker = partPicker
    if (!picker) return
    setPartPicker(null)
    await enqueue({
      ...picker.video,
      page: part.page,
      title: `${picker.video.title} - ${part.title}`
    })
  }

  const enqueueAllParts = async () => {
    const picker = partPicker
    if (!picker || queueingAllParts) return
    setQueueingAllParts(true)
    try {
      let queuedCount = 0
      for (const part of picker.pages) {
        if (
          await enqueue({
            ...picker.video,
            page: part.page,
            title: `${picker.video.title} - ${part.title}`
          })
        )
          queuedCount += 1
      }
      setPartPicker(null)
      onShowToast?.(`已将 ${queuedCount} / ${picker.pages.length} 个分片加入队列。`)
    } finally {
      setQueueingAllParts(false)
    }
  }

  useEffect(() => {
    loadRecommendation()
  }, [])
  const onKey = (key) =>
    setQuery((value) =>
      key === 'BACKSPACE'
        ? value.slice(0, -1)
        : key === 'CLEAR'
          ? ''
          : key === 'SPACE'
            ? `${value} `
            : `${value}${key}`
    )
  return (
    <section className="bilibili-plugin-page">
      <div className="bilibili-plugin-title">
        <BilibiliIcon />
        <span>Bilibili</span>
      </div>
      <div className="bilibili-video-grid">
        {!loading &&
          videos.map((video) => (
            <button
              className="bilibili-video-card"
              type="button"
              key={video.id}
              disabled={Boolean(partLoadingId)}
              onClick={() => selectVideo(video)}
            >
              <div className="bilibili-video-thumb">
                {video.thumbnail && (
                  <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
                )}
                {partLoadingId === video.id && (
                  <i className="bilibili-card-spinner" aria-label="Loading video parts" />
                )}
                {video.isMusic && <span>MUSIC</span>}
              </div>
              <div className="bilibili-video-name">{video.title}</div>
              <div className="bilibili-video-artist">{video.artist || '-'}</div>
            </button>
          ))}
        {loading ? (
          <div className="bilibili-state bilibili-loading-state">
            <span className="bilibili-spinner" aria-hidden="true" />
            <span>Loading...</span>
          </div>
        ) : (
          message && <div className="bilibili-state">{message}</div>
        )}
      </div>
      <div className="bilibili-footer">
        <div className="bilibili-search-wrap">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setKeyboardOpen(true)}
            onClick={() => setKeyboardOpen(true)}
            onKeyDown={(e) => e.key === 'Enter' && load(query)}
            inputMode="none"
            placeholder="请输入关键词搜索 Bilibili"
          />
          <button type="button" onClick={() => load(query)}>
            <Search size={28} />
          </button>
        </div>
        <div className="bilibili-pagination">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => load(query, page - 1)}
          >
            <ChevronLeft />
            上一页
          </button>
          <span>{totalPages ? `${page} / ${totalPages}` : page}</span>
          <button
            type="button"
            disabled={loading || !hasNext}
            onClick={() => load(query, page + 1)}
          >
            下一页
            <ChevronRight />
          </button>
        </div>
      </div>
      {partPicker && (
        <div
          className="bilibili-part-modal"
          role="dialog"
          aria-modal="true"
          aria-label="选择视频分片"
        >
          <div className="bilibili-part-dialog">
            <div className="bilibili-part-heading">
              <strong>选择分片</strong>
              <div>
                <button type="button" disabled={queueingAllParts} onClick={enqueueAllParts}>
                  {queueingAllParts ? '加入中…' : '播放全部'}
                </button>
                <button
                  type="button"
                  disabled={queueingAllParts}
                  onClick={() => setPartPicker(null)}
                >
                  关闭
                </button>
              </div>
            </div>
            <div className="bilibili-part-list">
              {partPicker.pages.map((part) => (
                <button
                  type="button"
                  disabled={queueingAllParts}
                  key={part.cid}
                  onClick={() => selectPart(part)}
                >
                  <b>P{part.page}</b>
                  <span>{part.title}</span>
                  {part.duration > 0 && (
                    <small>
                      {Math.floor(part.duration / 60)}:{String(part.duration % 60).padStart(2, '0')}
                    </small>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {KeyboardComponent && (
        <KeyboardComponent
          visible={keyboardOpen}
          onKey={onKey}
          onText={(text) => setQuery((value) => `${value}${text || ''}`)}
          onConfirm={() => {
            setKeyboardOpen(false)
            load(query)
          }}
          displayValue={query}
        />
      )}
    </section>
  )
}

BilibiliPluginPage.propTypes = {
  onEnqueueMedia: PropTypes.func.isRequired,
  onShowToast: PropTypes.func,
  KeyboardComponent: PropTypes.elementType
}
export default BilibiliPluginPage
