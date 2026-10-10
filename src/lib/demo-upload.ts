import 'server-only';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export async function saveDemoImage(file:File){
 if(file.size>8*1024*1024)throw new Error('Images must be 8MB or less.');
 const buffer=Buffer.from(await file.arrayBuffer());
 const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
 const webp=buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';
 if(!png&&!jpeg&&!webp)throw new Error('Upload a valid PNG, JPEG or WebP image.');
 const name=`${randomUUID()}.${png?'png':jpeg?'jpg':'webp'}`;
 const folder=join(process.cwd(),'public','demo','uploads');await mkdir(folder,{recursive:true});await writeFile(join(folder,name),buffer);return `/demo/uploads/${name}`;
}
