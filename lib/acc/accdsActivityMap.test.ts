import { describe, it, expect } from 'vitest';
import { mapAccdsRow, type AccdsActivityRow } from './accdsActivityMap';

const REAL_ROW: AccdsActivityRow = {
  id: '13885172713',
  activity_id: '7e6216ee9f258678b33b22b74993cb91e86142d5',
  created_at: '2026-06-11T16:44:19.527Z',
  account_id: '63aeb891-e88c-4c25-840a-7cd5b27b392b',
  project_id: 'de161948-703f-413c-979a-8983c70d84d9',
  service_group: 'docs',
  activity_verb: 'view-entity',
  created_by: '5KETKE4XDK45',
  created_by_email: 'Monica.Rayos@hermosillo.com',
  created_by_display_name: 'Monica Rayos Hernandez',
  object_id: 'urn:adsk.wipprod:dm.lineage:knjOP4dQRaqWPVoSjTwOAQ',
  object_object_type: 'items:autodesk.bim360:File',
  object_display_name: 'DJI_0821.JPG',
  docs_object_folder_id: 'urn:adsk.wipprod:fs.folder:co.Huur3S48TbaYtZBc2hmMKg',
  docs_object_folder_display_name: '09.06.2026',
};

describe('mapAccdsRow', () => {
  it('maps a real accds row to the insert shape', () => {
    const r = mapAccdsRow(REAL_ROW, 'run-1');
    expect(r.accdsActivityId).toBe('7e6216ee9f258678b33b22b74993cb91e86142d5');
    expect(r.autodeskId).toBe('5KETKE4XDK45');
    expect(r.userEmail).toBe('monica.rayos@hermosillo.com'); // lowercased
    expect(r.userName).toBe('Monica Rayos Hernandez');
    expect(r.projectId).toBe('de161948-703f-413c-979a-8983c70d84d9');
    expect(r.serviceGroup).toBe('docs');
    expect(r.activityVerb).toBe('view-entity');
    expect(r.objectName).toBe('DJI_0821.JPG');
    expect(r.folderName).toBe('09.06.2026');
    expect(r.createdAt).toEqual(new Date('2026-06-11T16:44:19.527Z'));
    expect(r.ingestRunId).toBe('run-1');
  });

  it('null-coalesces missing optional fields and defaults ingestRunId to null', () => {
    const r = mapAccdsRow({
      activity_id: 'x', created_at: '2026-01-01T00:00:00.000Z',
      project_id: 'p1', activity_verb: 'issue-create', created_by: 'U1',
    });
    expect(r.userEmail).toBeNull();
    expect(r.userName).toBeNull();
    expect(r.serviceGroup).toBeNull();
    expect(r.objectName).toBeNull();
    expect(r.folderName).toBeNull();
    expect(r.ingestRunId).toBeNull();
  });
});
