import { useCallback, useState, useRef } from 'react'
import { fetchWithAuth } from '@/lib/api-client'
import type { ClassAccess, ClassRequest } from '../types'
import { asObject } from '../utils/response-narrowing'

export function useYearbookAccess(
  id: string | undefined,
  initialAccess?: { access: Record<string, ClassAccess | null>, requests: Record<string, ClassRequest | null> }
) {
  const [myAccessByClass, setMyAccessByClass] = useState<Record<string, ClassAccess | null>>(
    initialAccess?.access || {}
  )
  const [myRequestByClass, setMyRequestByClass] = useState<Record<string, ClassRequest | null>>(
    initialAccess?.requests || {}
  )
  const [accessDataLoaded, setAccessDataLoaded] = useState(
    !!initialAccess?.access && Object.keys(initialAccess.access).length > 0
  )
  const [requestsByClass, setRequestsByClass] = useState<Record<string, ClassRequest[]>>({})
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [accessForbidden, setAccessForbidden] = useState(false)

  const isFetchingAccessRef = useRef(false)

  const fetchAllAccess = useCallback(async (albumRef: React.MutableRefObject<any>) => {
    if (!id || isFetchingAccessRef.current) return
    const currentAlbum = albumRef.current
    const canManageAlbum = currentAlbum?.isOwner === true || currentAlbum?.isAlbumAdmin === true || currentAlbum?.isGlobalAdmin === true

    try {
      isFetchingAccessRef.current = true
      // 1. Fetch My Access & My Requests for ALL classes
      const myAccessRes = await fetchWithAuth(`/api/albums/${id}/my-access-all`, {
        credentials: 'include',
        cache: 'no-store'
      })
      const myAccessData = asObject(await myAccessRes.json().catch(() => ({})))

      if (myAccessRes.status === 403) {
        setAccessForbidden(true)
        setMyAccessByClass({})
        setMyRequestByClass({})
      } else if (myAccessRes.ok) {
        setAccessForbidden(false)
        setMyAccessByClass((myAccessData.access as Record<string, ClassAccess | null>) || {})
        setMyRequestByClass((myAccessData.requests as Record<string, ClassRequest | null>) || {})
      }

      // 2. If Admin, fetch ALL pending requests for approval
      if (canManageAlbum) {
        const requestsRes = await fetchWithAuth(`/api/albums/${id}/join-requests?status=pending`, {
          credentials: 'include',
          cache: 'no-store'
        })
        const requestsData = await requestsRes.json().catch(() => [])

        if (requestsRes.ok && Array.isArray(requestsData)) {
          const byClass: Record<string, ClassRequest[]> = {}
          requestsData.forEach((req: any) => {
            const clsId = req.assigned_class_id
            if (clsId) {
              if (!byClass[clsId]) byClass[clsId] = []
              byClass[clsId].push(req)
            }
          })
          setRequestsByClass((prev) => ({ ...prev, ...byClass }))
        }
      }

      setAccessDataLoaded(true)
    } catch (e) {
      console.error('Error fetching access data:', e)
    } finally {
      isFetchingAccessRef.current = false
    }
  }, [id])

  return {
    myAccessByClass,
    setMyAccessByClass,
    myRequestByClass,
    setMyRequestByClass,
    accessDataLoaded,
    setAccessDataLoaded,
    requestsByClass,
    setRequestsByClass,
    selectedRequestId,
    setSelectedRequestId,
    accessForbidden,
    fetchAllAccess
  }
}






