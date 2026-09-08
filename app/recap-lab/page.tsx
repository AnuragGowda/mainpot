import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import RecapLab from './recap-lab';
export const metadata:Metadata = {title:'Character study', robots:{index:false,follow:false}};
export default function Page() {if (process.env.NODE_ENV !== 'development') notFound(); return <RecapLab/>;}
