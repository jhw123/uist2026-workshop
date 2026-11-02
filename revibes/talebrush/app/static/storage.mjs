import {migrateSaved} from './tracks.mjs';

export function loadSavedWorkspace(storage,key){
  try{
    const raw=storage.getItem(key);
    if(!raw)return {workspace:null,writable:true,error:''};
    const stored=JSON.parse(raw);
    if(stored?.draft?.schemaVersion!==2&&!storage.getItem(key+'.before-cast-remix'))storage.setItem(key+'.before-cast-remix',raw);
    return {workspace:migrateSaved(stored),writable:true,error:''};
  }catch{
    return {workspace:null,writable:false,error:'Your saved draft could not be loaded. Automatic saving is paused to protect the original. Export this tab’s work before closing it; the saved draft remains in browser storage.'};
  }
}

export function saveWorkspace(storage,key,workspace,writable){
  if(!writable)return false;
  storage.setItem(key,JSON.stringify(workspace));return true;
}
