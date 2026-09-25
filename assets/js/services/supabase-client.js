import { config } from '../config.js';
let clientPromise=null;
export function isConfigured(){return Boolean(config.supabaseUrl&&config.supabaseAnonKey);}
export async function getClient(){if(!isConfigured())throw new Error('runtime_not_configured');if(!clientPromise){clientPromise=import('https://esm.sh/@supabase/supabase-js@2.105.0').then(({createClient})=>createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}));}return clientPromise;}
export async function getProfile(){const sb=await getClient();const {data:{user},error:userError}=await sb.auth.getUser();if(userError)throw userError;if(!user)return{data:null,error:null};const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();return{data,error};}
