import PropTypes from 'prop-types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import './BilibiliPluginPage.css'

const LANDSCAPE_PAGE_SIZE = 10
const PORTRAIT_COLUMNS = 2

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
  const [pageSize, setPageSize] = useState(null)
  const videoGridRef = useRef(null)
  const activeRequestRef = useRef({ mode: 'recommend', query: '' })
  const loadRequestIdRef = useRef(0)

  const updatePageSize = useCallback(() => {
    const grid = videoGridRef.current
    if (!grid) return

    const portrait = Boolean(grid.closest('.main-screen-frame--portrait'))
    if (!portrait) {
      setPageSize((current) => (current === LANDSCAPE_PAGE_SIZE ? current : LANDSCAPE_PAGE_SIZE))
      return
    }

    const gridStyle = window.getComputedStyle(grid)
    const columnGap = Number.parseFloat(gridStyle.columnGap) || 0
    const rowGap = Number.parseFloat(gridStyle.rowGap) || 0
    const availableWidth = grid.clientWidth
    const availableHeight = grid.clientHeight
    if (availableWidth <= 0 || availableHeight <= 0) return

    const cardWidth = (availableWidth - columnGap * (PORTRAIT_COLUMNS - 1)) / PORTRAIT_COLUMNS
    const estimatedCardHeight = (cardWidth * 9) / 16 + 7 + 16 * 1.2 * 2 + 3 + 13 * 1.2
    const renderedCard = grid.querySelector('.bilibili-video-card')
    const cardHeight = Math.max(estimatedCardHeight, renderedCard?.scrollHeight || 0)
    const visibleRows = Math.max(1, Math.floor((availableHeight + rowGap) / (cardHeight + rowGap)))
    const nextPageSize = visibleRows * PORTRAIT_COLUMNS

    setPageSize((current) => (current === nextPageSize ? current : nextPageSize))
  }, [])

  const loadVideos = useCallback(
    async ({ mode, query: nextQuery, page: nextPage = 1 }) => {
      if (!pageSize) return

      const keyword = String(nextQuery || '').trim()
      if (mode === 'search' && !keyword) {
        setVideos([])
        setPage(1)
        setTotalPages(1)
        setHasNext(false)
        setMessage('请输入关键词搜索 Bilibili 视频。')
        return
      }

      const requestId = loadRequestIdRef.current + 1
      loadRequestIdRef.current = requestId
      setLoading(true)
      setMessage('')

      try {
        const channel =
          mode === 'recommend'
            ? 'plugin:bilibili-player:recommend'
            : 'plugin:bilibili-player:search'
        const payload =
          mode === 'recommend'
            ? { page: nextPage, pageSize }
            : { query: keyword, page: nextPage, pageSize }
        const result = await window.api.plugins.invoke(channel, payload)
        if (requestId !== loadRequestIdRef.current) return
        if (!result?.ok) {
          throw new Error(
            result?.error ||
              (mode === 'recommend' ? 'Bilibili recommendation failed.' : 'Bilibili search failed.')
          )
        }

        if (mode === 'recommend') setQuery(String(result.query || ''))
        if (nextPage > 1 && !result.videos?.length) {
          setHasNext(false)
          setTotalPages(Math.max(1, nextPage - 1))
          setMessage('已到最后一页。')
          return
        }

        setVideos(Array.isArray(result.videos) ? result.videos : [])
        setPage(Number(result.page || nextPage))
        setTotalPages(result.totalPages ? Math.max(1, Number(result.totalPages)) : null)
        setHasNext(Boolean(result.hasNext))
        if (!result.videos?.length) setMessage('没有找到视频。')
      } catch (error) {
        if (requestId !== loadRequestIdRef.current) return

        setVideos([])
        setMessage(
          error.message ||
            (mode === 'recommend' ? 'Bilibili recommendation failed.' : 'Bilibili search failed.')
        )
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setLoading(false)
        }
      }
    },
    [pageSize]
  )

  const handleSearch = () => {
    const request = { mode: 'search', query: query.trim() }
    activeRequestRef.current = request
    loadVideos({ ...request, page: 1 })
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
    const grid = videoGridRef.current
    if (!grid) return undefined

    const resizeObserver = new ResizeObserver(updatePageSize)
    resizeObserver.observe(grid)
    updatePageSize()

    return () => resizeObserver.disconnect()
  }, [updatePageSize])

  useEffect(() => {
    if (!pageSize) return

    loadVideos({ ...activeRequestRef.current, page: 1 })
  }, [loadVideos, pageSize])

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(updatePageSize)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [videos, updatePageSize])

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
      <div className="bilibili-video-grid" ref={videoGridRef}>
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
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            inputMode="none"
            placeholder="请输入关键词搜索 Bilibili"
          />
          <button type="button" onClick={handleSearch}>
            <Search size={28} />
          </button>
        </div>
        <div className="bilibili-pagination">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => loadVideos({ ...activeRequestRef.current, page: page - 1 })}
          >
            <ChevronLeft />
            上一页
          </button>
          <span>{totalPages ? `${page} / ${totalPages}` : page}</span>
          <button
            type="button"
            disabled={loading || !hasNext}
            onClick={() => loadVideos({ ...activeRequestRef.current, page: page + 1 })}
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
            handleSearch()
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
