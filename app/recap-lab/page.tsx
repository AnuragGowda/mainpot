import type { Metadata } from 'next';
import RecapLab from './recap-lab';
export const metadata:Metadata = {title:'Character study', robots:{index:false,follow:false}};
export default function Page() {return <RecapLab/>;}
