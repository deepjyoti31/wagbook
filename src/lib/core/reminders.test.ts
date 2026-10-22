import { describe, expect, it } from "vitest";
import { remindersToSend, type ReminderInput, type ReminderWords } from "./reminders";

const w: ReminderWords = {
  vaccinationNone: "V0 {parent} {pet} {date}",
  vaccinationLapses: "V1 {pet} {vaccine} {until}",
  arrival: "A {parent} {pet} {date}",
  dropOffFrom: "from {time}",
  pickup: "P {pet} {date}",
  pickUpBy: "by {time}",
  unpaid: "U {number} {amount} {url}",
  groom: "G {parent} {pet} {date}",
};

const stay = (id: string, startDate: string, endDate: string) => ({ id, petName: "Bruno", parentName: "Priya Demo", phone: "+919800000101", startDate, endDate });
const base: ReminderInput = { today: "2027-04-14", kennelName: "K", upcoming: [], inHouse: [], unpaid: [], sent: [] };

describe("reminders to send", () => {
  it("asks for a vaccination card within a week of a stay, once", () => {
    const input = { ...base, upcoming: [{ ...stay("b1", "2027-04-18", "2027-04-20"), vaccinations: [] }] };
    expect(remindersToSend(w, input).map((r) => [r.kind, r.text])).toEqual([["vaccination", "V0 Priya Bruno 18 Apr 2027"]]);
    const lapsing = { ...base, upcoming: [{ ...stay("b1", "2027-04-18", "2027-04-20"), vaccinations: [{ vaccine: "rabies", valid_until: "2027-04-19" }] }] };
    expect(remindersToSend(w, lapsing)[0].text).toBe("V1 Bruno rabies 19 Apr 2027");
    expect(remindersToSend(w, { ...input, sent: [{ kind: "vaccination", subjectId: "b1", sentOn: "2027-04-14" }] })).toEqual([]);
    // Too far off, or fine.
    expect(remindersToSend(w, { ...base, upcoming: [{ ...stay("b2", "2027-04-25", "2027-04-26"), vaccinations: [] }] })).toEqual([]);
    expect(remindersToSend(w, { ...base, upcoming: [{ ...stay("b3", "2027-04-18", "2027-04-20"), vaccinations: [{ vaccine: "rabies", valid_until: "2028-01-01" }] }] })).toEqual([]);
  });

  it("says see you tomorrow, and goes home tomorrow, with the kennel's times", () => {
    const fine = [{ vaccine: "rabies", valid_until: "2028-01-01" }];
    const input = { ...base, dropOff: "09:00:00", pickUp: "18:00:00", upcoming: [{ ...stay("b1", "2027-04-15", "2027-04-17"), vaccinations: fine }], inHouse: [stay("b2", "2027-04-10", "2027-04-15")] };
    expect(remindersToSend(w, input).map((r) => [r.kind, r.text])).toEqual([
      ["arrival", "A Priya Bruno 15 Apr 2027 from 09:00"],
      ["pickup", "P Bruno 15 Apr 2027 by 18:00"],
    ]);
    expect(remindersToSend(w, { ...input, dropOff: null, pickUp: null }).map((r) => r.text)).toEqual(["A Priya Bruno 15 Apr 2027", "P Bruno 15 Apr 2027"]);
  });

  it("reminds about an unpaid bill three days after it was issued, and again three days after the last reminder", () => {
    const bill = { id: "i1", number: "WB/27-28/0001", parentName: "Priya Demo", phone: "+91", issuedOn: "2027-04-11", dueMinor: 120000, url: "https://x/inv/t" };
    expect(remindersToSend(w, { ...base, unpaid: [bill] }).map((r) => r.text)).toEqual(["U WB/27-28/0001 ₹1,200 https://x/inv/t"]);
    expect(remindersToSend(w, { ...base, unpaid: [{ ...bill, issuedOn: "2027-04-12" }] })).toEqual([]);
    expect(remindersToSend(w, { ...base, unpaid: [bill], sent: [{ kind: "unpaid", subjectId: "i1", sentOn: "2027-04-12" }] })).toEqual([]);
    expect(remindersToSend(w, { ...base, unpaid: [bill], sent: [{ kind: "unpaid", subjectId: "i1", sentOn: "2027-04-11" }] })).toHaveLength(1);
    expect(remindersToSend(w, { ...base, unpaid: [{ ...bill, dueMinor: 0 }] })).toEqual([]);
  });

  it("says a pet is due a groom again from three days before, once for each groom", () => {
    const card = { petId: "p1", petName: "Bruno", parentName: "Priya Demo", phone: "+91", everyWeeks: 6, last: { id: "a1", day: "2027-03-06" } };
    // Due on 17 April: on the list from the 14th.
    expect(remindersToSend(w, { ...base, grooms: [card] }).map((r) => [r.kind, r.subjectId, r.text])).toEqual([["groom", "a1", "G Priya Bruno 17 Apr 2027"]]);
    expect(remindersToSend(w, { ...base, today: "2027-04-13", grooms: [card] })).toEqual([]);
    expect(remindersToSend(w, { ...base, grooms: [card], sent: [{ kind: "groom", subjectId: "a1", sentOn: "2027-04-14" }] })).toEqual([]);
    // No weeks set, or never groomed: nothing.
    expect(remindersToSend(w, { ...base, grooms: [{ ...card, everyWeeks: null }, { ...card, last: null }] })).toEqual([]);
  });
});
