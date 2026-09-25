import { getClient,isConfigured,getProfile } from './supabase-client.js';
const NEXT_KEY='flexicash:web:next';
function safeNext(value){if(!value)return null;try{const u=new URL(value,location.origin);return u.origin===location.origin?u.pathname+u.search+u.hash:null}catch{return null}}
export const authService={
  isConfigured,
  rememberNext(value){const next=safeNext(value);if(next)sessionStorage.setItem(NEXT_KEY,next);},
  async getSession(){if(!isConfigured())return null;const sb=await getClient();const {data,error}=await sb.auth.getSession();if(error)throw error;return data.session;},
  async getUser(){if(!isConfigured())return null;const sb=await getClient();const {data,error}=await sb.auth.getUser();if(error)throw error;return data.user;},
  async getProfile(){if(!isConfigured())return{data:null,error:new Error('runtime_not_configured')};return getProfile();},
  async login(email,password,turnstileToken){if(!isConfigured())return{ok:false,error:'La configuration runtime n’est pas fournie dans cette édition publique.'};try{const sb=await getClient();const options=turnstileToken?{captchaToken:turnstileToken}:undefined;const {data,error}=await sb.auth.signInWithPassword({email,password,options});return error?{ok:false,error:error.message}:{ok:true,data};}catch(error){return{ok:false,error:error.message||'Connexion impossible'};}},
  async signInWithGoogle(next){if(!isConfigured())return{ok:false,error:'Configuration runtime absente.'};try{this.rememberNext(next);const sb=await getClient();const redirectTo=`${location.origin}/auth/callback.html`;const {data,error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo}});return error?{ok:false,error:error.message}:{ok:true,data};}catch(error){return{ok:false,error:error.message||'Connexion Google impossible'};}}
};
export async function redirectAfterAuth(){const next=sessionStorage.getItem(NEXT_KEY);if(next){sessionStorage.removeItem(NEXT_KEY);location.assign(next);return{ok:true};}location.assign('../app/dashboard.html');return{ok:true};}
