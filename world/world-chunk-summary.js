(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else Object.assign(root.HeungShingWorld ||= {},api);
})(globalThis,function(){
  'use strict';
  const CHUNK_SUMMARY_FIELDS=Object.freeze(['population','powerSupply','powerDemand','taxIncome','expenses','demandR','demandC','demandI']);
  // This is a sparse table of developed storage chunks, not an entry for every
  // terrain chunk. It contains no cells, paths, model metadata or render state.
  class WorldChunkSummaryTable {
    constructor(records=[]){this.rows=new Map();for(const row of records)this.set(row.chunkId,row);}
    set(chunkId,values){
      if(!/^s:\d+:\d+$/.test(chunkId))throw Error('Invalid summary chunk');
      const row={chunkId};
      for(const field of CHUNK_SUMMARY_FIELDS){const value=values[field]??0;if(!Number.isFinite(value))throw Error('Invalid chunk summary');row[field]=value;}
      this.rows.set(chunkId,row);return row;
    }
    replace(contributions,demands={}){
      const next=new Map();
      for(const contribution of contributions){
        if(!contribution.developed)continue;
        const id=contribution.chunkId;
        if(!next.has(id))next.set(id,{chunkId:id,...Object.fromEntries(CHUNK_SUMMARY_FIELDS.map(field=>[field,0]))});
        const row=next.get(id);
        for(const field of CHUNK_SUMMARY_FIELDS.slice(0,5))row[field]+=contribution[field]||0;
      }
      this.rows.clear();
      for(const row of next.values())this.set(row.chunkId,{...row,demandR:demands.demandR||0,demandC:demands.demandC||0,demandI:demands.demandI||0});
    }
    serialize(){return [...this.rows.values()].map(row=>({...row})).sort((a,b)=>a.chunkId.localeCompare(b.chunkId));}
    unloaded(activeStorageIds){return this.serialize().filter(row=>!activeStorageIds.has(row.chunkId));}
  }
  return {WorldChunkSummaryTable,CHUNK_SUMMARY_FIELDS};
});
