import { deleteDB, openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { OfflineRallyEvent } from '@/types/domain'

interface OfflineDb extends DBSchema {
  rally_events: {
    key: string
    value: OfflineRallyEvent
  }
}

let dbPromise: Promise<IDBPDatabase<OfflineDb>> | null = null

function getDb(): Promise<IDBPDatabase<OfflineDb>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDb>('zoc9-offline-v1', 1, {
      upgrade(db) {
        db.createObjectStore('rally_events', {
          keyPath: 'clientEventId',
        })
      },
    })
  }

  return dbPromise
}

export async function enqueueRallyEvent(event: OfflineRallyEvent): Promise<void> {
  const db = await getDb()
  await db.put('rally_events', event)
}

export async function removeQueuedRallyEvent(clientEventId: string): Promise<void> {
  const db = await getDb()
  await db.delete('rally_events', clientEventId)
}

export async function listQueuedRallyEvents(): Promise<OfflineRallyEvent[]> {
  const db = await getDb()
  return db.getAll('rally_events')
}

export async function flushQueuedRallyEvents(
  syncHandler: (event: OfflineRallyEvent) => Promise<void>,
): Promise<void> {
  const events = await listQueuedRallyEvents()

  for (const event of events) {
    await syncHandler(event)
    await removeQueuedRallyEvent(event.clientEventId)
  }
}

export async function clearOfflineQueue(): Promise<void> {
  dbPromise = null
  await deleteDB('zoc9-offline-v1')
}
