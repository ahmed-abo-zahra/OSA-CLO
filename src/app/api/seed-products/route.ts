import { NextResponse } from 'next/server';
export async function POST() {
 return NextResponse.json({error:'Legacy destructive seed endpoint disabled. Demo data is isolated and initialized automatically.'},{status:410});
}
