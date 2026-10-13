import Image from 'next/image';
import manifest from '@/lib/demo-image-manifest.json';
interface Props { src: string; alt: string; sizes?: string; priority?: boolean; className?: string }
// SVG viewport selects the individual studio photograph at its natural aspect ratio.
// The source atlas remains intact; no stretching and no neighboring product enters the frame.
export default function ProductImage({src,alt,sizes='(max-width:640px) 50vw, 25vw',priority=false,className=''}:Props) {
 const [url,fragment] = src.split('#'); const tile = fragment?.startsWith('tile=') ? Number(fragment.slice(5)) : null;
 const dimension = (manifest as Record<string,{width:number;height:number}>)[url];
 if(tile!==null && dimension && Number.isInteger(tile) && tile>=0 && tile<10){
  const w=dimension.width/5,h=dimension.height/2;
  const x=tile%5*w,y=Math.floor(tile/5)*h;
  const clipId=`aso-${url.replace(/[^a-z0-9]/gi,"")}-${tile}`;
  return <svg role="img" aria-label={alt} viewBox={`${tile%5*w} ${Math.floor(tile/5)*h} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className={`w-full h-full bg-[#eee6da] ${className}`}>
   <defs><clipPath id={clipId}><rect x={x+0.5} y={y+0.5} width={w-1} height={h-1}/></clipPath></defs>
   <image clipPath={`url(#${clipId})`} href={`/_next/image?url=${encodeURIComponent(url)}&w=2048&q=75`} width={dimension.width} height={dimension.height} />
  </svg>;
 }
 return <div className={`relative w-full h-full overflow-hidden ${className}`}><Image src={url} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" /></div>;
}
