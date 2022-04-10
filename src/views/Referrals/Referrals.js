import React, { useState } from "react";
import { useWeb3React } from "@web3-react/core";

import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import SEO from "../../components/Common/SEO";
import Tab from "../../components/Tab/Tab";
import Footer from "../../Footer";
import {
  useChainId,
  getPageTitle,
  formatAmount,
  USD_DECIMALS,
  helperToast,
  formatDate,
  getTokenInfo,
  getExplorerUrl,
  shortenAddress,
  fetcher,
} from "../../Helpers";
import { decodeReferralCode, useReferralsData } from "../../Api/referrals";

import "./Referrals.css";
import { registerReferralCode, setTraderReferralCodeByUser, useInfoTokens } from "../../Api";
import { utils } from "ethers";
import { BiCopy, BiEditAlt } from "react-icons/bi";
import Tooltip from "../../components/Tooltip/Tooltip";
import { useCopyToClipboard } from "react-use";
import Loader from "../../components/Common/Loader";
import Modal from "../../components/Modal/Modal";
import useSWR from "swr";
import { getContract } from "../../Addresses";
import ReferralContract from "../../abis/ReferralStorage.json";
import { RiQuestionLine } from "react-icons/ri";
import { FiPlus } from "react-icons/fi";

const REBATES = "Rebates";
const REFERRERS = "Referrers";
let TAB_OPTIONS = [REBATES, REFERRERS];

function getDollarValue(value) {
  return `$${formatAmount(value, USD_DECIMALS, 2, true, "0.00")}`;
}

export default function Referrals() {
  const { active, account, library } = useWeb3React();
  const { chainId } = useChainId();
  const { infoTokens } = useInfoTokens(library, chainId, active, undefined, undefined);
  const ReferralToken = getContract(chainId, "Referral");
  const { data: userReferralCode } = useSWR(
    account && [
      `ReferralStorage:traderReferralCodes:${active}`,
      chainId,
      ReferralToken,
      "traderReferralCodes",
      account,
    ],
    {
      fetcher: fetcher(library, ReferralContract),
    }
  );
  let referralCodeInString;
  if (userReferralCode) {
    referralCodeInString = decodeReferralCode(userReferralCode);
  }
  function handleCreateReferralCode(event, code) {
    event.preventDefault();
    let referralCodeHex = utils.formatBytes32String(code);

    return registerReferralCode(chainId, referralCodeHex, {
      library,
      successMsg: `Referral code created!`,
      failMsg: "Referral code creation failed.",
    });
  }

  let [activeTab, setActiveTab] = useState(REBATES);
  const referralsData = useReferralsData(chainId, account);
  // console.log(referralsData);
  function renderBody() {
    if (activeTab === REFERRERS) {
      if (!account) {
        return (
          <CreateReferrarCode
            isWalletConnected={!!account}
            handleCreateReferralCode={handleCreateReferralCode}
            library={library}
            chainId={chainId}
          />
        );
      }
      if (!referralsData) return <Loader />;
      if (referralsData?.codes?.length > 0) {
        return (
          <ReferrersStats
            infoTokens={infoTokens}
            handleCreateReferralCode={handleCreateReferralCode}
            referralsData={referralsData}
            chainId={chainId}
          />
        );
      } else {
        return (
          <CreateReferrarCode
            isWalletConnected={!!account}
            handleCreateReferralCode={handleCreateReferralCode}
            library={library}
            chainId={chainId}
          />
        );
      }
    }
    if (activeTab === REBATES) {
      if (!referralsData) return <Loader />;
      if (!referralCodeInString) {
        return <JoinReferrarCode isWalletConnected={!!account} library={library} chainId={chainId} />;
      }

      return (
        <Rebates
          referralCodeInString={referralCodeInString}
          infoTokens={infoTokens}
          chainId={chainId}
          library={library}
          referralsData={referralsData}
        />
      );
    }
  }

  return (
    <SEO title={getPageTitle("Referrals")}>
      <div className="default-container page-layout">
        <div className="referral-tab-container">
          <Tab options={TAB_OPTIONS} option={activeTab} setOption={setActiveTab} onChange={setActiveTab} />
        </div>
        {renderBody()}
      </div>
      <Footer />
    </SEO>
  );
}

function CreateReferrarCode({ handleCreateReferralCode, isWalletConnected }) {
  let [referralCode, setReferralCode] = useState("");
  return (
    <div className="card text-center create-referrar-code">
      <h1>Generate Referral Code</h1>
      <p>
        Looks like you don't have a referral code to share. Enter a code below and hit submit to create it on-chain.
      </p>
      {isWalletConnected ? (
        <form onSubmit={(e) => handleCreateReferralCode(e, referralCode)}>
          <input
            type="text"
            value={referralCode}
            placeholder="Enter a code"
            onChange={(e) => {
              setReferralCode(e.target.value);
            }}
          />
          <button className="default-btn" type="submit">
            Create
          </button>
        </form>
      ) : (
        <button className="default-btn" type="submit">
          Connect Wallet
        </button>
      )}
    </div>
  );
}

function ReferrersStats({ referralsData, handleCreateReferralCode, infoTokens, chainId }) {
  let [referralCode, setReferralCode] = useState("");
  const [, copyToClipboard] = useCopyToClipboard();
  let { cumulativeStats, referrerTotalStats, discountDistributions } = referralsData;

  return (
    <div className="referral-body-container">
      <div className="referral-stats">
        <InfoCard label="Total Traders Referred" data={cumulativeStats?.referralsCount || "0"} />
        <InfoCard label="Weekly Trading Volume" data={getDollarValue(cumulativeStats?.volume)} />
        <InfoCard label="Weekly Rebates" data={getDollarValue(cumulativeStats?.rebates)} />
        <InfoCard label="Weekly Rebates For Traders" data={getDollarValue(cumulativeStats?.discountUsd)} />
      </div>
      <div className="list">
        <Card
          title={
            <div className="referral-table-header">
              <span>Referral Codes</span>
              <Button>
                <FiPlus /> <span className="ml-small">Add New</span>
              </Button>
            </div>
          }
        >
          <table className="referral-table">
            <thead>
              <tr>
                <th scope="col">Referral Code</th>
                <th scope="col">Traders Referred</th>
                <th scope="col">Total Volume</th>
                <th scope="col">Total Rebate</th>
              </tr>
            </thead>
            <tbody>
              {referrerTotalStats.map((stat, index) => {
                return (
                  <tr key={index}>
                    <td data-label="Referral Code">
                      <div className="table-referral-code">
                        <Tooltip
                          handle={<p className="referral-code">{stat.referralCode}</p>}
                          position="bottom"
                          renderContent={() => "Copy Referral Link"}
                        />
                        <p
                          onClick={() => {
                            copyToClipboard(`https://gmx.io/trade?refId=${stat.referralCode}`);
                            helperToast.success("Referral link copied to your clipboard");
                          }}
                        >
                          <BiCopy />
                        </p>
                      </div>
                    </td>
                    <td data-label="Traders Referred">{stat.tradedReferralsCount}</td>
                    <td data-label="Total Volume">{getDollarValue(stat.volume)}</td>
                    <td data-label="Total Rebate">{getDollarValue(stat.totalRebateUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="App-card-divider"></div>
          <form className="create-referral-code" onSubmit={(e) => handleCreateReferralCode(e, referralCode)}>
            <input
              type="text"
              value={referralCode}
              placeholder="Enter a code"
              onChange={(e) => {
                setReferralCode(e.target.value);
              }}
            />
            <Button>Create</Button>
          </form>
        </Card>
      </div>
      <div className="reward-history">
        <Card title="Rebates Distribution History">
          <table className="referral-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Amount</th>
                <th scope="col">Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {discountDistributions.map((rebate, index) => {
                let tokenInfo = getTokenInfo(infoTokens, rebate.token);
                let explorerURL = getExplorerUrl(chainId);
                return (
                  <tr key={index}>
                    <td data-label="Date">{formatDate(rebate.timestamp)}</td>
                    <td data-label="Amount">
                      {formatAmount(rebate.amount, tokenInfo.decimals, 4, true)} {tokenInfo.symbol}
                    </td>
                    <td data-label="Tx Hash">
                      <a target="_blank" rel="noopener noreferrer" href={explorerURL + `tx/${rebate.transactionHash}`}>
                        {shortenAddress(rebate.transactionHash, 20)}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Rebates({ referralsData, infoTokens, chainId, library, referralCodeInString }) {
  let { referralTotalStats, rebateDistributions } = referralsData;
  let [isEditModalOpen, setIsEditModalOpen] = useState(false);
  let [editReferralCode, setEditReferralCode] = useState("");
  let [isUpdateSubmitting, setIsUpdateSubmitting] = useState(false);
  let open = () => setIsEditModalOpen(true);
  let close = () => setIsEditModalOpen(false);

  function handleUpdateReferralCode(event) {
    event.preventDefault();
    setIsUpdateSubmitting(true);
    let referralCodeHex = utils.formatBytes32String(editReferralCode);
    return setTraderReferralCodeByUser(chainId, referralCodeHex, {
      library,
      successMsg: `Referral code updated!`,
      failMsg: "Referral code updated failed.",
    }).finally(() => {
      setIsUpdateSubmitting(false);
      setIsEditModalOpen(false);
    });
  }

  return (
    <div className="rebate-container">
      <div className="referral-stats">
        <InfoCard label="Total Volume Traded" data={getDollarValue(referralTotalStats?.volume)} />
        <InfoCard label="Total Rebate" data={getDollarValue(referralTotalStats?.discountUsd)} />
        <InfoCard
          label="Active Referral Code"
          data={
            <div className="referral-code-edit">
              <span>{referralCodeInString}</span>
              <BiEditAlt onClick={open} />
            </div>
          }
        />
        <Modal
          className="Connect-wallet-modal"
          isVisible={isEditModalOpen}
          setIsVisible={close}
          label="Edit Referral Code"
        >
          <div className="edit-referral-modal">
            <form onSubmit={handleUpdateReferralCode}>
              <input
                disabled={isUpdateSubmitting}
                type="text"
                placeholder="Enter new referral code"
                className="text-input edit-referral-code-input"
                value={editReferralCode}
                onChange={(e) => setEditReferralCode(e.target.value)}
              />
              <button type="submit" className="App-cta Exchange-swap-button" disabled={isUpdateSubmitting}>
                {isUpdateSubmitting ? "Updating..." : "Update Referral Code"}
              </button>
            </form>
          </div>
        </Modal>
      </div>
      {rebateDistributions.length > 0 && (
        <div className="reward-history">
          <Card title="Rebates Distribution History">
            <table className="referral-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {rebateDistributions.map((rebate, index) => {
                  let tokenInfo = getTokenInfo(infoTokens, rebate.token);
                  let explorerURL = getExplorerUrl(chainId);
                  return (
                    <tr key={index}>
                      <td data-label="Date">{formatDate(rebate.timestamp)}</td>
                      <td data-label="Amount">
                        {formatAmount(rebate.amount, tokenInfo.decimals, 4, true)} {tokenInfo.symbol}
                      </td>
                      <td data-label="Tx Hash">
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href={explorerURL + `tx/${rebate.transactionHash}`}
                        >
                          {shortenAddress(rebate.transactionHash, 20)}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, data }) {
  return (
    <div className="info-card">
      <h3 className="label">
        {label}{" "}
        <Tooltip handle={<RiQuestionLine />} position="left-bottom" renderContent={() => "This is sample copy!"} />
      </h3>
      <div className="data">{data}</div>
    </div>
  );
}

function JoinReferrarCode({ isWalletConnected, chainId, library }) {
  let [referralCode, setReferralCode] = useState("");
  let [isSubmitting, setIsSubmitting] = useState(false);
  function handleSetTraderReferralCode(event, code) {
    event.preventDefault();
    setIsSubmitting(true);
    let referralCodeHex = utils.formatBytes32String(code);
    return setTraderReferralCodeByUser(chainId, referralCodeHex, {
      library,
      successMsg: `Referral code added!`,
      failMsg: "Adding referral code failed.",
    }).finally(() => {
      setIsSubmitting(false);
    });
  }
  return (
    <div className="card text-center create-referrar-code">
      <h1>Join Referral Code</h1>
      <p>Please enter a referral code to start earning rebates.</p>
      {isWalletConnected ? (
        <form onSubmit={(e) => handleSetTraderReferralCode(e, referralCode)}>
          <input
            type="text"
            value={referralCode}
            disabled={isSubmitting}
            placeholder="Enter a code"
            onChange={(e) => {
              setReferralCode(e.target.value);
            }}
          />
          <button className="default-btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting.." : "Submit"}
          </button>
        </form>
      ) : (
        <button className="default-btn" type="submit">
          Connect Wallet
        </button>
      )}
    </div>
  );
}
