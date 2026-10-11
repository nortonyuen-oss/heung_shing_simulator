// Synchronise the supplied festival sounds to the recorded 6 game-minutes/second timeline.
// Keeps the direct capture for inspection and avoids Web Audio capture gaps on window blur.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const dir=path.resolve(__dirname,'../.data/taizi-dragon-boat-recording-with-sound');
const full=path.join(dir,'full-process.mp4'),raw=path.join(dir,'raw-capture.mp4');
if(!fs.existsSync(raw))fs.copyFileSync(full,raw);
const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',raw],{encoding:'utf8'}));
if(!Number.isFinite(duration)||duration<120)throw Error('Incomplete race video');
const sources=['hk_chinesedrums.mp3','dragon-boat-team-physch-up-75297.mp3','racingdragonboat.mp3','18834__wim__rowing-boat.wav','urban.m4a'];
const args=['-y','-i',raw];sources.forEach((name,i)=>{if(i===2||i===4)args.push('-stream_loop','-1');args.push('-i',path.resolve(__dirname,'../Sounds',name));});
const filters=['[1:a]atrim=duration=10,asetpts=PTS-STARTPTS,volume=0.42,adelay=20000:all=1[opening]'];
for(const [input,name,length,volume,starts] of [[2,'cheers',2.5,.38,[30,50,90]],[4,'paddles',5,.25,[32.5,52.5,92.5]]]){
 filters.push(`[${input}:a]asplit=3[${name}0][${name}1][${name}2]`);
 starts.forEach((start,i)=>filters.push(`[${name}${i}]atrim=duration=${length},asetpts=PTS-STARTPTS,volume=${volume},adelay=${start*1000}:all=1[${name}out${i}]`));
}
filters.push('[3:a]atrim=duration=87.5,asetpts=PTS-STARTPTS,volume=0.324,adelay=32500:all=1[music]');
filters.push(`[5:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=0.04[city]`);
const beds=['opening','music',...['cheers','paddles'].flatMap(n=>[0,1,2].map(i=>`${n}out${i}`)),'city'];
filters.push(`${beds.map(n=>`[${n}]`).join('')}amix=inputs=${beds.length}:normalize=0:duration=longest,aresample=48000,aformat=channel_layouts=stereo[mix]`);
args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[mix]','-c:v','copy','-c:a','aac','-b:a','128k','-t',String(duration),'-movflags','+faststart',path.join(dir,'full-process-mixed.mp4'));
execFileSync('ffmpeg',args,{stdio:['ignore','ignore','pipe']});
fs.renameSync(path.join(dir,'full-process-mixed.mp4'),full);
fs.writeFileSync(path.join(dir,'audio-mix.json'),JSON.stringify({duration,mode:'phase-synchronised supplied audio',opening:[20,30],cheers:[[30,32.5],[50,52.5],[90,92.5]],music:[[32.5,120]],paddles:[[32.5,37.5],[52.5,57.5],[92.5,97.5]]},null,2));
console.log('Synchronized festival soundtrack:',duration,'seconds');
