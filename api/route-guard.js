// Keep earlier records intact, including accounts with multiple legacy open routes.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export function routeTransitionError(previous, next) {
  const before=Array.isArray(previous?.routes)?previous.routes:[];
  const after=Array.isArray(next?.routes)?next.routes:[];
  const oldOpen=new Set(before.filter(r=>!r.finishedAt).map(r=>r.id));
  const newOpen=after.filter(r=>!r.finishedAt&&!oldOpen.has(r.id));
  for(const old of before){
    const updated=after.find(r=>r.id===old.id);
    if(old.finishedAt&&JSON.stringify(canonical(old))!==JSON.stringify(canonical(updated)))
      return {code:'FINISHED_ROUTE_LOCKED',message:'Geçmişteki tamamlanmış rota değiştirilemez.'};
    if(!old.finishedAt&&updated?.finishedAt&&(!Array.isArray(updated.stops)||old.stops?.some(s=>s.status==='pending'&&!updated.stops.some(x=>x.id===s.id&&x.status!=='pending'))||updated.stops.some(s=>s.status==='pending')))
      return {code:'ROUTE_HAS_PENDING_STOPS',message:'Rotayı bitirmeden önce bekleyen durakları tamamla.'};
    if(!old.finishedAt&&updated?.finishedAt&&updated.end&&!updated.returnReachedAt)
      return {code:'RETURN_NOT_REACHED',message:'Rotayı bitirmeden önce dönüş durağına varışı işaretle.'};
  }
  if(newOpen.length&&(newOpen.length>1||before.some(r=>!r.finishedAt&&!after.find(x=>x.id===r.id)?.finishedAt)))
    return {code:'ACTIVE_ROUTE_EXISTS',message:'Açık rota bitmeden yeni rota oluşturulamaz.'};
  return null;
}
