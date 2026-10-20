import { ADDRESS_MAX, calledByPartner } from "@/lib/config";
import { useConfigStore } from "@/store/config-store";

/** 一行称呼：我怎么叫对方，以及对方怎么叫我 */
export function AddressLine({ tone = "paper" }: { tone?: "paper" | "glass" }) {
  const couple = useConfigStore((s) => s.config.couple);
  const soloMode = useConfigStore((s) => s.config.soloMode);
  const setCoupleIdentity = useConfigStore((s) => s.setCoupleIdentity);
  if (soloMode) return null;
  const called = calledByPartner(couple);

  return (
    <div className={tone === "glass" ? "address-line glass" : "address-line"}>
      <label>
        称呼
        <input
          aria-label="称呼"
          maxLength={ADDRESS_MAX}
          value={couple.addressForThem}
          placeholder={couple.partnerName}
          onChange={(e) =>
            void setCoupleIdentity({ addressForThem: e.target.value })
          }
        />
      </label>
      {called ? <span className="address-called">称你 {called}</span> : null}
    </div>
  );
}
