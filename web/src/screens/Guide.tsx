import type { ReactNode } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';

function Pm({ q, children }: { q: string; children: ReactNode }) {
  return <a className="text-primary underline" href={`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}`} target="_blank" rel="noopener">{children}</a>;
}

export function Guide() {
  return (
    <>
      <h1 className="font-serif text-xl font-bold tracking-wide">Guide</h1>
      <p className="mb-4 text-sm text-muted-foreground">How your daily status works and the research behind it. Training guidance, not medical advice.</p>
      <Card>
        <CardContent className="pt-1">
          <Accordion type="multiple" defaultValue={['status']}>
            <AccordionItem value="status">
              <AccordionTrigger>🚦 Daily status</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p>Signals in order of weight:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li><b>Feel</b> (weighted most): fatigue, soreness, sleep quality, stress and mood, scored out of 25 against your own 4-week normal. Well below normal, or any answer at the worst level = <b>GO EASY</b>; a little below = <b>CAUTION</b>.</li>
                  <li><b>HRV 7-day trend</b>: the 7-day average of your HRV against your 60-day normal. Below the band, or unusually high = <b>CAUTION</b>. Low HRV plus high resting HR plus low Feel = <b>GO EASY</b>.</li>
                  <li><b>Sleep</b>: a night under 6 hours lowers the status one step.</li>
                  <li><b>Sickness</b>: Yes (below the neck) = <b>GO EASY</b>; Mild (above the neck) = one step lower, at least CAUTION.</li>
                  <li><b>Resting HR</b> only confirms the others.</li>
                </ul>
                <p><b>GO</b> needs Feel at or above normal, 7 h+ sleep, HRV and resting HR in range and no sickness.</p>
                <p className="text-muted-foreground">Based on: <Pm q="Saw 2016 subjective objective measures athlete">Saw 2016</Pm> · <Pm q="Plews 2013 training adaptation heart rate variability elite endurance">Plews 2013</Pm> · <Pm q="Buchheit 2014 monitoring training status heart rate">Buchheit 2014</Pm> · <Pm q="Fullagar 2015 sleep athletic performance">Fullagar 2015</Pm> · <Pm q="Halson 2014 monitoring training load">Halson 2014</Pm></p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="weekly">
              <AccordionTrigger>📅 Weekly check</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p>7-day HRV below its band 3+ days in a row = <b>DELOAD</b>; with resting HR also above its band 3+ days = <b>DELOAD - STRONG</b>. 1-2 days, resting HR alone, or two short nights in a row = <b>WATCH</b>.</p>
                <p className="text-muted-foreground">Based on: <Pm q="Plews 2012 heart rate variability overreaching triathlete">Plews 2012</Pm> · <Pm q="Meeusen 2013 overtraining syndrome consensus">Meeusen 2013</Pm></p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="load">
              <AccordionTrigger>📈 Load vs plan</AccordionTrigger>
              <AccordionContent>If you plan workouts in intervals.icu, Aevigor compares the last 7 days of actual load with the plan. More than 20% above plan is flagged. Only sports you planned are counted.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="loadpage">
              <AccordionTrigger>🏋️ Load page</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p><b>Fitness</b> (42-day weighted load), <b>Fatigue</b> (7-day) and <b>Form</b> (yesterday's Fitness minus Fatigue) are worked out the same way as intervals.icu, per sport (Cycling by default). After today they follow your planned workouts.</p>
                <p><b>Form zones</b> match intervals.icu: below −30 high risk, −30 to −10 optimal, −10 to +5 grey zone, +5 to +20 fresh, above +20 transition. VO2 and FTP tests go best at Form +5 to +15.</p>
                <p><b>Ramp rate</b>: Fitness change over 7 days. 3-7 a week is ideal, over 8 is too fast.</p>
                <p><b>Tests</b> are found by name in your intervals.icu calendar: "FTP test", "VO2 test" (or "5 min test") and "Durability test".</p>
                <p className="text-muted-foreground">Based on: <Pm q="Banister 1975 systems model training athletic performance">Banister 1975</Pm> · <Pm q="Gabbett 2016 training injury prevention paradox">Gabbett 2016</Pm> · <Pm q="Foster 2001 new approach monitoring exercise training session RPE">Foster 2001</Pm> (session RPE)</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="trendspage">
              <AccordionTrigger>📊 Trends page</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p>Six charts in order of weight: Feel, HRV, Sleep, Resting HR, Daily RPE and Training load. Each shows daily values, a bold 7-day line and your normal range. Drag the slider to read one morning's values next to the day before's effort and load.</p>
                <p>These are patterns in your own data, not proof of cause.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="start">
              <AccordionTrigger>⏳ Getting started</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p>Your normal is learned from your own history, so the status needs a couple of weeks of overnight HRV or resting HR in intervals.icu. The more mornings you check in, the better the Feel score works.</p>
                <p>Data syncs on its own each morning and around noon. Tap <b>Sync</b> after your watch has synced to update straight away.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="feedback" className="border-b-0">
              <AccordionTrigger>🐞 Beta feedback</AccordionTrigger>
              <AccordionContent>This is an early test version. If something looks wrong, tell Ben with a screenshot and the date.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </>
  );
}
