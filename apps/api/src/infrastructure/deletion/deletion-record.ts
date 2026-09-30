import type pg from 'pg';

export type DeletableType = 'conversation' | 'material' | 'exam' | 'attempt';

export async function recordDeletion(
  client: pg.PoolClient,
  ownerId: string,
  type: DeletableType,
  id: string,
) {
  await client.query(
    `INSERT INTO deletion_record(owner_id,resource_type,resource_id,deleted_at,purge_state)
     VALUES ($1,$2,$3,now(),'pending')
     ON CONFLICT(resource_type,resource_id) DO UPDATE
       SET owner_id=EXCLUDED.owner_id,deleted_at=EXCLUDED.deleted_at,purge_state='pending',purged_at=NULL`,
    [ownerId, type, id],
  );
}
