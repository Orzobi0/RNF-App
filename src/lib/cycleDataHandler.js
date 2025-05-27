import { supabase } from '@/lib/supabaseClient';
    import { format, differenceInDays, startOfDay, parseISO, compareAsc } from 'date-fns';

    const generateCycleDaysForRecord = (recordIsoDate, cycleStartIsoDate) => {
      if (!recordIsoDate || !cycleStartIsoDate) return 0;
      const rDate = startOfDay(parseISO(recordIsoDate));
      const sDate = startOfDay(parseISO(cycleStartIsoDate));
      return differenceInDays(rDate, sDate) + 1;
    };
    
    export const processCycleEntries = (entriesFromView, cycleStartIsoDate) => {
      if (!entriesFromView || !Array.isArray(entriesFromView) || !cycleStartIsoDate) return [];
      
      const sortedEntries = [...entriesFromView].sort((a, b) => {
        const dateA = a.timestamp ? parseISO(a.timestamp) : (a.iso_date ? parseISO(a.iso_date) : 0);
        const dateB = b.timestamp ? parseISO(b.timestamp) : (b.iso_date ? parseISO(b.iso_date) : 0);
        return compareAsc(dateA, dateB);
      });

      return sortedEntries.map(entry => ({
        ...entry,
        id: entry.id, 
        isoDate: entry.iso_date || (entry.timestamp ? format(parseISO(entry.timestamp), 'yyyy-MM-dd') : null),
        date: entry.timestamp ? format(parseISO(entry.timestamp), 'dd/MM') : (entry.iso_date ? format(parseISO(entry.iso_date), 'dd/MM') : 'N/A'),
        cycleDay: entry.cycle_day || generateCycleDaysForRecord(entry.iso_date || entry.timestamp, cycleStartIsoDate), // Use cycle_day from view
        temperature_raw: entry.temperature_raw,
        temperature_corrected: entry.temperature_corrected,
        use_corrected: entry.use_corrected,
        mucusSensation: entry.mucus_sensation,
        mucusAppearance: entry.mucus_appearance,
        fertility_symbol: entry.fertility_symbol,
        observations: entry.observations,
        ignored: entry.ignored,
        temperature_chart: entry.temperature_chart, 
        timestamp: entry.timestamp 
      }));
    };

    export const fetchCurrentCycleDB = async (userId) => {
      const { data: cycleData, error: cycleError } = await supabase
        .from('cycles')
        .select('id, start_date, end_date')
        .eq('user_id', userId)
        .is('end_date', null) 
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

        if (cycleError && cycleError.code !== 'PGRST116') {
        console.error('Error fetching current cycle metadata:', cycleError);
        throw cycleError;
      }
      if (!cycleData) return null;

      const { data: entriesData, error: entriesError } = await supabase
        .from('entries_for_chart')
        .select('*')
        .eq('cycle_id', cycleData.id)
        .order('timestamp', { ascending: true });
      
      if (entriesError) {
        console.error('Error fetching entries for current cycle from view:', entriesError);
        throw entriesError;
      }

      return { id: cycleData.id, startDate: cycleData.start_date, data: entriesData || [] };
    };

    export const fetchArchivedCyclesDB = async (userId) => {
      const { data: cycles, error: cyclesError } = await supabase
        .from('cycles')
        .select('id, start_date')
        .eq('user_id', userId)
        .not('end_date', 'is', null) 
        .order('start_date', { ascending: false });

      if (cyclesError) {
        console.error('Error fetching archived cycles metadata:', cyclesError);
        throw cyclesError;
      }

      const cyclesWithEntries = await Promise.all(
        cycles.map(async (cycle) => {
          const { data: entriesData, error: entriesError } = await supabase
            .from('entries_for_chart')
            .select('*')
            .eq('cycle_id', cycle.id)
            .order('timestamp', { ascending: true });

          if (entriesError) {
            console.error(`Error fetching entries for archived cycle ${cycle.id} from view:`, entriesError);
            return { ...cycle, data: [] }; 
          }
          return { ...cycle, data: entriesData || [] };
        })
      );
      return cyclesWithEntries;
    };

    export const fetchCycleByIdDB = async (userId, cycleId) => {
      const { data: cycleData, error: cycleError } = await supabase
        .from('cycles')
        .select('id, start_date')
        .eq('id', cycleId)
        .eq('user_id', userId)
        .single();

      if (cycleError && cycleError.code !== 'PGRST116') { 
        console.error('Error fetching specific cycle metadata:', cycleError);
        throw cycleError;
      }
      if (!cycleData) return null;

      const { data: entriesData, error: entriesError } = await supabase
        .from('entries_for_chart')
        .select('*')
        .eq('cycle_id', cycleData.id)
        .order('timestamp', { ascending: true });

      if (entriesError) {
        console.error(`Error fetching entries for cycle ${cycleId} from view:`, entriesError);
        throw entriesError;
      }
      
      return { id: cycleData.id, startDate: cycleData.start_date, data: entriesData || [] };
    };
    
    export const createNewCycleDB = async (userId, startDate) => {
      const { data: newCycle, error: newCycleError } = await supabase
        .from('cycles')
        .insert({ user_id: userId, start_date: startDate, end_date: null }) 
        .select('id, start_date')
        .single();
      
      if (newCycleError) {
        console.error('Error creating new cycle:', newCycleError);
        throw newCycleError;
      }
      return newCycle;
    };

    export const createNewCycleEntry = async (payload) => {
      const entryToInsert = {
        cycle_id: payload.cycle_id,
        user_id: payload.user_id,
        timestamp: payload.timestamp ?? new Date().toISOString(),
        temperature_raw: payload.temperature_raw,
        temperature_corrected: payload.temperature_corrected,
        use_corrected: payload.use_corrected,
        mucus_sensation: payload.mucus_sensation,
        mucus_appearance: payload.mucus_appearance,
        fertility_symbol: payload.fertility_symbol,
        observations: payload.observations,
        ignored: payload.ignored,
      };

      const { data, error } = await supabase
        .from('entries')
        .insert(entryToInsert)
        .select('id')
        .single();
      if (error) {
        console.error('Error creating new cycle entry:', error);
        throw error;
      }
      return data;
    };

    export const updateCycleEntry = async (entryId, payload) => {
      const entryToUpdate = {
        temperature_raw: payload.temperature_raw,
        temperature_corrected: payload.temperature_corrected,
        use_corrected: payload.use_corrected,
        mucus_sensation: payload.mucus_sensation,
        mucus_appearance: payload.mucus_appearance,
        fertility_symbol: payload.fertility_symbol,
        observations: payload.observations,
        ignored: payload.ignored,
              };
      if (payload.timestamp) {
        entryToUpdate.timestamp = payload.timestamp;
      }


      const { data, error } = await supabase
        .from('entries')
        .update(entryToUpdate)
        .eq('id', entryId)
        .select('id')
        .single();
      if (error) {
        console.error('Error updating cycle entry:', error);
        throw error;
      }
      return data;
    };

    export const deleteCycleEntryDB = async (entryId, userId) => {
      const { error } = await supabase
        .from('entries')
        .delete()
        .eq('id', entryId)
        .eq('user_id', userId);
      if (error) {
        console.error('Error deleting record:', error);
        throw error;
      }
    };

    export const archiveCycleDB = async (cycleId, userId) => {
      const { error } = await supabase
        .from('cycles')
        .update({ end_date: format(startOfDay(new Date()), "yyyy-MM-dd")}) 
        .eq('id', cycleId)
        .eq('user_id', userId);
      if (error) {
        console.error('Error archiving cycle:', error);
        throw error;
      }
    };