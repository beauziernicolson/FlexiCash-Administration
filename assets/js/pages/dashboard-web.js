import { mount,renderClientSidebar,renderTopbar,renderBottomNav } from '../components.js';
import { getClient,isConfigured,getProfile } from '../services/supabase-client.js';
import '../app.js';
mount('#sidebar-mount',renderClientSidebar('dashboard'));mount('#topbar-mount',renderTopbar());mount('#bottomnav',renderBottomNav());
const status=document.querySelector('#account-state');
const failClosed=(message)=>{status.textContent=message;status.className='badge badge-info';document.querySelector('#tx').innerHTML=`<tr><td colspan="5"><div class="empty">${message}</div></td></tr>`;document.querySelector('#notif').textContent=message;};
if(!isConfigured()){failClosed('Runtime financier privé non configuré dans l’édition publique');}
else{try{const profile=await getProfile();if(profile?.data?.full_name)document.querySelector('#dashboard-greeting').textContent=`Bonjour ${profile.data.full_name.split(' ')[0]} 👋`;status.textContent='Session Web vérifiée';status.className='badge badge-success';const sb=await getClient();const {data:{session}}=await sb.auth.getSession();if(!session){location.replace('../auth/login.html');}else{failClosed('Données financières chargées uniquement par les RPC privées du runtime FlexiCash');status.textContent='Compte connecté';status.className='badge badge-success';}}catch(error){console.warn('[FlexiCash Web review]',error);failClosed('Service temporairement indisponible');}}
