import {openDB} from 'idb';
import {emptyDB,validateBackup} from './domain';
import type {Database} from './types';
const dbName='yin0612-pr-media-analysis-v1-'+encodeURIComponent(import.meta.env.BASE_URL);
const connection=openDB(dbName,1,{upgrade(db){if(!db.objectStoreNames.contains('workspace'))db.createObjectStore('workspace');}});
export async function load(){const data=validateBackup((await (await connection).get('workspace','data'))||emptyDB());if(!data.settings.apiUrl)data.settings.apiUrl=import.meta.env.VITE_API_URL||'';return data;}
export async function save(data:Database){await(await connection).put('workspace',data,'data');}
