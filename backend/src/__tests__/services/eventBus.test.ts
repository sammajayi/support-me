import { DONATION_EVENT, DonationEvent, eventBus } from "../../services/eventBus";

describe("eventBus", () => {
  afterEach(() => {
    eventBus.removeAllListeners(DONATION_EVENT);
  });

  it("delivers a donation payload to a subscribed listener", () => {
    const listener = jest.fn();
    eventBus.on(DONATION_EVENT, listener);

    const payload: DonationEvent = {
      donor: "GDONOR",
      creator: "GCREATOR",
      amount: "10000000",
      memo: "test",
      timestamp: 1700000000,
      ledger: 123,
      txHash: "deadbeef",
    };

    eventBus.emit(DONATION_EVENT, payload);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(payload);
  });

  it("stops delivering events to a listener once it is removed", () => {
    const listener = jest.fn();
    eventBus.on(DONATION_EVENT, listener);
    eventBus.off(DONATION_EVENT, listener);

    eventBus.emit(DONATION_EVENT, {
      donor: "GDONOR",
      creator: "GCREATOR",
      amount: "1",
      memo: "",
      timestamp: 0,
      ledger: 1,
      txHash: "x",
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple concurrent subscribers", () => {
    const first = jest.fn();
    const second = jest.fn();
    eventBus.on(DONATION_EVENT, first);
    eventBus.on(DONATION_EVENT, second);

    eventBus.emit(DONATION_EVENT, {
      donor: "GDONOR",
      creator: "GCREATOR",
      amount: "1",
      memo: "",
      timestamp: 0,
      ledger: 1,
      txHash: "x",
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
